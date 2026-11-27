/**
 * PERFUME replenishment (migration 202617040100) — owner 2026-11-27 08:10 CT "locations … make this more efficient and professional".
 * Acumatica / NetSuite style: each item at each own site has a min, a max, a bin and a usual reorder quantity (perfume.item_stock).
 * The report lists every item at or below its min once what is already on open purchase orders to that site is counted, with the
 * quantity to buy (up to max, or the usual reorder quantity, whichever is more) and the cheapest current supplier on the desk.
 * "Make purchase orders" hands the chosen rows to the existing PO engine (createPurchaseOrder + PO lines, one PO per vendor, each line
 * linked to the supplier's price-list row); rows with no supplier carrying the item are listed back, never guessed.
 */
import type pg from "pg";
import { z } from "zod";
import { createPurchaseOrder, vendorLineOf } from "./purchases.service.js";

export class ReorderInvalid extends Error {}

export const reorderQuery = z.object({ location_code: z.string().min(1).max(40).optional() });
export const reorderMakeSchema = z.object({
  location_code: z.string().min(1).max(40),
  item_ids: z.array(z.string().uuid()).min(1).max(500),
  expected_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export type ReorderRow = {
  item_id: string; display_name: string; tio_code: string | null; location_code: string; location_name: string; bin: string | null;
  on_hand: number; on_order: number; min_qty: number; max_qty: number | null; reorder_qty: number | null; to_buy: number;
  vendor_id: string | null; vendor: string | null; unit_cost_cents: number | null; line_cost_cents: number | null;
};

/** How much to buy: up to max when one is set, at least the usual reorder quantity, never less than 1. */
export function quantityToBuy(onHand: number, onOrder: number, min: number, max: number | null, reorderQty: number | null) {
  const have = onHand + onOrder;
  if (have > min) return 0;
  const toMax = max != null ? max - have : min - have + 1;
  return Math.max(1, toMax, reorderQty ?? 0);
}

export async function reorderReport(c: pg.PoolClient, f: z.infer<typeof reorderQuery>): Promise<{ rows: ReorderRow[] }> {
  const args: unknown[] = [];
  let where = "s.min_qty IS NOT NULL AND i.merged_into_id IS NULL AND l.own AND l.active";
  if (f.location_code) { args.push(f.location_code); where += ` AND s.location_code = $${args.length}`; }
  const r = await c.query<{ item_id: string; display_name: string; tio_code: string | null; location_code: string; location_name: string; bin: string | null;
    on_hand: number; on_order: number; min_qty: number; max_qty: number | null; reorder_qty: number | null; vendor_id: string | null; vendor: string | null; cents: string | null }>(
    `SELECT s.item_id, i.display_name, i.internal_code AS tio_code, s.location_code, l.name AS location_name, s.bin, s.qty AS on_hand,
            coalesce((SELECT sum(pl.qty - pl.qty_received) FROM perfume.purchase_order_lines pl JOIN perfume.purchase_orders p ON p.id = pl.po_id
                       WHERE pl.item_id = s.item_id AND p.location_code = s.location_code AND p.status = 'open' AND p.archived_at IS NULL AND pl.archived_at IS NULL), 0)::int AS on_order,
            s.min_qty, s.max_qty, s.reorder_qty, best.vendor_id, best.vendor, best.cents
       FROM perfume.item_stock s JOIN perfume.items i ON i.id = s.item_id JOIN perfume.locations l ON l.code = s.location_code
       LEFT JOIN LATERAL (
         SELECT l2.vendor_id, v.name AS vendor, r.price_cents::bigint AS cents
           FROM perfume.price_list_rows r JOIN perfume.price_lists l2 ON l2.id = r.list_id JOIN perfume.vendors v ON v.id = l2.vendor_id
          WHERE r.item_id = s.item_id AND l2.is_current AND l2.voided_at IS NULL AND r.price_cents > 0 AND v.kind IN ('buy', 'both') AND v.archived_at IS NULL
          ORDER BY r.price_cents, v.name LIMIT 1) best ON true
      WHERE ${where}
      ORDER BY l.sort_order, i.display_name`, args);
  const rows: ReorderRow[] = [];
  for (const x of r.rows) {
    const toBuy = quantityToBuy(x.on_hand, x.on_order, x.min_qty, x.max_qty, x.reorder_qty);
    if (toBuy <= 0) continue;
    const cost = x.cents == null ? null : Number(x.cents);
    rows.push({ item_id: x.item_id, display_name: x.display_name, tio_code: x.tio_code, location_code: x.location_code, location_name: x.location_name, bin: x.bin,
      on_hand: x.on_hand, on_order: x.on_order, min_qty: x.min_qty, max_qty: x.max_qty, reorder_qty: x.reorder_qty, to_buy: toBuy,
      vendor_id: x.vendor_id, vendor: x.vendor, unit_cost_cents: cost, line_cost_cents: cost == null ? null : cost * toBuy });
  }
  return { rows };
}

/** The chosen reorder rows become purchase orders (one per cheapest vendor) to that site, through the existing PO engine. */
export async function reorderToPurchaseOrders(c: pg.PoolClient, uid: string, x: z.infer<typeof reorderMakeSchema>) {
  const want = new Set(x.item_ids);
  const rows = (await reorderReport(c, { location_code: x.location_code })).rows.filter((r) => want.has(r.item_id));
  const skipped: Array<{ item_id: string; display_name: string; reason: string }> = [];
  for (const id of want) if (!rows.some((r) => r.item_id === id)) skipped.push({ item_id: id, display_name: "", reason: "not below its minimum at this site any more" });
  const byVendor = new Map<string, ReorderRow[]>();
  for (const r of rows) {
    if (!r.vendor_id) { skipped.push({ item_id: r.item_id, display_name: r.display_name, reason: "no supplier list carries it" }); continue; }
    byVendor.set(r.vendor_id, [...(byVendor.get(r.vendor_id) ?? []), r]);
  }
  const made: Array<{ id: string; number: string; vendor_id: string; lines: number }> = [];
  for (const [vendorId, list] of byVendor) {
    const po = await createPurchaseOrder(c, uid, { vendor_id: vendorId, location_code: x.location_code, expected_by: x.expected_by ?? null, terms: null,
      notes: `Reorder — ${list.length} item(s) at or below their minimum at ${x.location_code}` });
    let n = 0;
    for (const r of list) {
      const vl = await vendorLineOf(c, vendorId, r.item_id);
      if (!vl) { skipped.push({ item_id: r.item_id, display_name: r.display_name, reason: "the supplier's line changed — run the report again" }); continue; }
      n++;
      await c.query(
        `INSERT INTO perfume.purchase_order_lines (po_id, line_no, item_id, price_list_row_id, vendor_sku, description, upc, qty, unit_cost_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [po.id, n, r.item_id, vl.row_id, vl.sku, vl.description, vl.upc, r.to_buy, vl.cents ?? 0]);
      await c.query(`INSERT INTO perfume.purchase_order_events (po_id, kind, detail, created_by) VALUES ($1, 'line_added', $2::jsonb, $3)`,
        [po.id, JSON.stringify({ line_no: n, description: vl.description, qty: r.to_buy, unit_cost_cents: vl.cents, reorder: { location_code: x.location_code, on_hand: r.on_hand, on_order: r.on_order, min_qty: r.min_qty, max_qty: r.max_qty } }), uid]);
    }
    made.push({ ...po, vendor_id: vendorId, lines: n });
  }
  return { purchase_orders: made, skipped };
}
