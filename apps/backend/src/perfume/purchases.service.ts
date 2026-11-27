/**
 * PERFUME-PURCHASE-ORDERS — what I buy from a vendor (owner 2026-11-26 19:12 CT: "sales order and purchase ordres should already
 * be created"). A PO goes to one vendor (perfume.vendors). It is started by hand, or from a sales order: every line still to
 * buy goes to the vendor with the lowest current price for that item (the cost the order already carries, else the best
 * current list), one PO per vendor. Each line carries the vendor's own code and description from their current list, so the
 * vendor reads their own words. Qty received per line; the PO is received when every line is. History, Excel and PDF.
 * Owner-only perfume schema; never posts to accounting.
 *
 * Wired both ways: PO → vendor, sales order, items, the vendor's list row; vendor → its POs (purchaseOrdersOfVendor);
 * item → its POs (purchaseOrdersOfItem); sales order → its POs (purchaseOrdersOfOrder) and its history ('purchased').
 */
import type pg from "pg";
import { z } from "zod";
import ExcelJS from "exceljs";
import { esc, money, usDate } from "./quotes.service.js";
import { getOrder, OrderNotFound } from "./orders.service.js";

export const PO_STATUSES = ["open", "received", "cancelled"] as const;
export type PoStatus = typeof PO_STATUSES[number];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const text = (n: number) => z.string().trim().max(n).nullable().optional().transform((v) => (v ? v : null));
const cents = z.number().int().min(0).max(100_000_000_00);

export const poSchema = z.object({
  vendor_id: z.string().uuid().optional(),
  order_date: date.optional(), expected_by: date.nullable().optional(),
  currency: z.enum(["USD", "MXN"]).optional(), terms: text(4000), notes: text(4000),
});
export const poLineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(), description: text(400), upc: text(40), vendor_sku: text(120),
  qty: z.number().int().min(1).max(1_000_000), unit_cost_cents: cents.optional(),
});
export const poLinePatchSchema = z.object({ qty: z.number().int().min(1).max(1_000_000).optional(), unit_cost_cents: cents.optional(), qty_received: z.number().int().min(0).max(1_000_000).optional() });

export class PoNotFound extends Error { constructor() { super("purchase_order_not_found"); } }
export class PoInvalid extends Error {}

async function event(c: pg.PoolClient, poId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.purchase_order_events (po_id, kind, detail, created_by, created_at) VALUES ($1, $2, $3::jsonb, $4, clock_timestamp())`,
    [poId, kind, JSON.stringify(detail), uid]);
}
async function orderEvent(c: pg.PoolClient, orderId: string, uid: string | null, kind: string, detail: Record<string, unknown>) {
  await c.query(`INSERT INTO perfume.sales_order_events (order_id, kind, detail, created_by, created_at) VALUES ($1, $2, $3::jsonb, $4, clock_timestamp())`,
    [orderId, kind, JSON.stringify(detail), uid]);
}

const TOTALS = `(SELECT coalesce(sum(l.qty * l.unit_cost_cents), 0)::bigint FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL) AS total_cents,
  (SELECT count(*)::int FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL) AS lines,
  (SELECT coalesce(sum(l.qty), 0)::int FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL) AS units,
  (SELECT coalesce(sum(l.qty_received), 0)::int FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL) AS units_received`;
const HEADER = `p.id, p.number, p.vendor_id, v.name AS vendor_name, v.contact AS vendor_contact, p.sales_order_id,
  (SELECT o.number FROM perfume.sales_orders o WHERE o.id = p.sales_order_id) AS sales_order_number,
  (SELECT o.customer_name FROM perfume.sales_orders o WHERE o.id = p.sales_order_id) AS sales_order_customer,
  p.order_date::text, p.expected_by::text, p.status, p.currency, p.terms, p.notes, p.created_at, p.updated_at`;
const FROM = `perfume.purchase_orders p JOIN perfume.vendors v ON v.id = p.vendor_id`;

export type PoLine = { id: string; line_no: number; sales_order_line_id: string | null; item_id: string | null; price_list_row_id: string | null; vendor_sku: string | null;
  description: string; upc: string | null; qty: number; qty_received: number; unit_cost_cents: number };
export type PoFull = Record<string, unknown> & { id: string; number: string; vendor_id: string; vendor_name: string; vendor_contact: string | null;
  sales_order_id: string | null; sales_order_number: string | null; order_date: string; expected_by: string | null; status: PoStatus; currency: string;
  terms: string | null; notes: string | null; lines: PoLine[]; events: Array<Record<string, unknown>> };

export async function listPurchaseOrders(c: pg.PoolClient, f: { status?: string; vendor_id?: string; item_id?: string; sales_order_id?: string; q?: string } = {}) {
  const where = ["p.archived_at IS NULL"];
  const args: unknown[] = [];
  if (f.status) { args.push(f.status); where.push(`p.status = $${args.length}`); }
  if (f.vendor_id) { args.push(f.vendor_id); where.push(`p.vendor_id = $${args.length}`); }
  if (f.sales_order_id) { args.push(f.sales_order_id); where.push(`p.sales_order_id = $${args.length}`); }
  if (f.item_id) { args.push(f.item_id); where.push(`EXISTS (SELECT 1 FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL AND l.item_id = $${args.length})`); }
  if (f.q?.trim()) { args.push(`%${f.q.trim().toLowerCase()}%`); where.push(`(lower(p.number) LIKE $${args.length} OR lower(v.name) LIKE $${args.length})`); }
  return (await c.query(`SELECT ${HEADER}, ${TOTALS} FROM ${FROM} WHERE ${where.join(" AND ")} ORDER BY p.order_date DESC, p.number DESC`, args)).rows;
}
export const purchaseOrdersOfVendor = (c: pg.PoolClient, vendorId: string) => listPurchaseOrders(c, { vendor_id: vendorId });
export const purchaseOrdersOfItem = (c: pg.PoolClient, itemId: string) => listPurchaseOrders(c, { item_id: itemId });
export const purchaseOrdersOfOrder = (c: pg.PoolClient, orderId: string) => listPurchaseOrders(c, { sales_order_id: orderId });

export async function getPurchaseOrder(c: pg.PoolClient, id: string): Promise<PoFull> {
  const h = (await c.query(`SELECT ${HEADER}, ${TOTALS} FROM ${FROM} WHERE p.id = $1 AND p.archived_at IS NULL`, [id])).rows[0];
  if (!h) throw new PoNotFound();
  const lines = (await c.query(
    `SELECT l.id, l.line_no, l.sales_order_line_id, l.item_id, l.price_list_row_id, l.vendor_sku, l.description, l.upc, l.qty, l.qty_received, l.unit_cost_cents::bigint AS unit_cost_cents
       FROM perfume.purchase_order_lines l WHERE l.po_id = $1 AND l.archived_at IS NULL ORDER BY l.line_no`, [id])).rows;
  const events = (await c.query(
    `SELECT e.id, e.kind, e.detail, e.created_at, u.email AS by_email FROM perfume.purchase_order_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE e.po_id = $1 ORDER BY e.created_at, e.id`, [id])).rows;
  return { ...(h as PoFull), lines: lines.map((l) => ({ ...l, unit_cost_cents: Number(l.unit_cost_cents) }) as PoLine), events };
}

/** This vendor's own line for the item on their current list (lowest price first): their code, their words, their price. */
export async function vendorLineOf(c: pg.PoolClient, vendorId: string, itemId: string) {
  const r = (await c.query<{ id: string; sku: string | null; description: string; upc: string | null; cents: string | null }>(
    `SELECT r.id, r.sku, r.description, r.upc, r.price_cents::bigint AS cents
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      WHERE l.vendor_id = $1 AND r.item_id = $2 AND l.is_current AND l.voided_at IS NULL AND r.price_cents IS NOT NULL AND r.price_cents > 0
      ORDER BY r.price_cents, r.row_no LIMIT 1`, [vendorId, itemId])).rows[0];
  return r ? { row_id: r.id, sku: r.sku, description: r.description, upc: r.upc, cents: r.cents == null ? null : Number(r.cents) } : null;
}

async function itemFacts(c: pg.PoolClient, itemId: string) {
  return (await c.query<{ display_name: string; upc: string | null }>(
    `SELECT i.display_name, (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = i.id ORDER BY u.upc LIMIT 1) AS upc FROM perfume.items i WHERE i.id = $1 AND i.merged_into_id IS NULL`,
    [itemId])).rows[0] ?? null;
}

async function assertVendor(c: pg.PoolClient, vendorId: string) {
  const v = (await c.query<{ kind: string }>(`SELECT kind FROM perfume.vendors WHERE id = $1 AND archived_at IS NULL`, [vendorId])).rows[0];
  if (!v) throw new PoInvalid("That vendor is not on the desk.");
  if (v.kind === "sell") throw new PoInvalid("That list is a competitor's; I do not buy from it.");
}

export async function createPurchaseOrder(c: pg.PoolClient, uid: string, x: z.infer<typeof poSchema>, salesOrderId: string | null = null) {
  if (!x.vendor_id) throw new PoInvalid("Pick the vendor.");
  await assertVendor(c, x.vendor_id);
  const r = await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.purchase_orders (vendor_id, sales_order_id, order_date, expected_by, currency, terms, notes, created_by)
     VALUES ($1,$2,coalesce($3::date, current_date),$4,coalesce($5,'USD'),$6,$7,$8) RETURNING id, number`,
    [x.vendor_id, salesOrderId, x.order_date ?? null, x.expected_by ?? null, x.currency ?? null, x.terms, x.notes, uid]);
  await event(c, r.rows[0]!.id, uid, "created", { number: r.rows[0]!.number, vendor_id: x.vendor_id, sales_order_id: salesOrderId });
  return r.rows[0]!;
}

/** What each sales-order line still needs bought: ordered minus already on a live PO (never bought twice). */
async function stillToBuy(c: pg.PoolClient, orderId: string) {
  return (await c.query<{ id: string; line_no: number; item_id: string | null; description: string; upc: string | null; need: number; cost_vendor_id: string | null; cost_cents: string | null }>(
    `SELECT l.id, l.line_no, l.item_id, l.description, l.upc, l.cost_vendor_id, l.cost_cents::bigint AS cost_cents,
            l.qty - coalesce((SELECT sum(pl.qty) FROM perfume.purchase_order_lines pl JOIN perfume.purchase_orders p ON p.id = pl.po_id
                               WHERE pl.sales_order_line_id = l.id AND pl.archived_at IS NULL AND p.archived_at IS NULL AND p.status <> 'cancelled'), 0)::int AS need
       FROM perfume.sales_order_lines l WHERE l.order_id = $1 AND l.archived_at IS NULL ORDER BY l.line_no`, [orderId])).rows.filter((l) => l.need > 0);
}

/** Buy the sales order: one PO per vendor, each line to the vendor with the lowest current price. Lines without an item or with
 *  no vendor carrying it are listed back, never guessed. */
export async function purchaseOrdersFromOrder(c: pg.PoolClient, uid: string, orderId: string, x: { expected_by?: string | null } = {}) {
  let so;
  try { so = await getOrder(c, orderId); } catch (e) { if (e instanceof OrderNotFound) throw new PoNotFound(); throw e; }
  if (so.status === "cancelled") throw new PoInvalid("The sales order is cancelled.");
  const need = await stillToBuy(c, orderId);
  const byVendor = new Map<string, Array<{ sol: typeof need[number]; vl: NonNullable<Awaited<ReturnType<typeof vendorLineOf>>> }>>();
  const skipped: Array<{ line_no: number; description: string; reason: string }> = [];
  for (const l of need) {
    if (!l.item_id) { skipped.push({ line_no: l.line_no, description: l.description, reason: "no item on the line" }); continue; }
    // The vendor the order was costed on, while they still carry it; else the cheapest buy vendor right now.
    let vl = l.cost_vendor_id ? await vendorLineOf(c, l.cost_vendor_id, l.item_id) : null;
    let vendorId = vl ? l.cost_vendor_id : null;
    if (!vl) {
      const best = (await c.query<{ vendor_id: string }>(
        `SELECT l2.vendor_id FROM perfume.price_list_rows r JOIN perfume.price_lists l2 ON l2.id = r.list_id JOIN perfume.vendors v ON v.id = l2.vendor_id
          WHERE r.item_id = $1 AND l2.is_current AND l2.voided_at IS NULL AND r.price_cents > 0 AND v.kind IN ('buy', 'both') AND v.archived_at IS NULL
          ORDER BY r.price_cents, v.name LIMIT 1`, [l.item_id])).rows[0];
      if (best) { vendorId = best.vendor_id; vl = await vendorLineOf(c, best.vendor_id, l.item_id); }
    }
    if (!vendorId || !vl) { skipped.push({ line_no: l.line_no, description: l.description, reason: "no vendor list carries it" }); continue; }
    const arr = byVendor.get(vendorId) ?? []; arr.push({ sol: l, vl }); byVendor.set(vendorId, arr);
  }
  const made: Array<{ id: string; number: string; vendor_id: string; lines: number }> = [];
  for (const [vendorId, rows] of byVendor) {
    const po = await createPurchaseOrder(c, uid, { vendor_id: vendorId, expected_by: x.expected_by ?? null, currency: so.currency as "USD" | "MXN", terms: null, notes: null }, orderId);
    let n = 0;
    for (const { sol, vl } of rows) {
      n++;
      await c.query(
        `INSERT INTO perfume.purchase_order_lines (po_id, line_no, sales_order_line_id, item_id, price_list_row_id, vendor_sku, description, upc, qty, unit_cost_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [po.id, n, sol.id, sol.item_id, vl.row_id, vl.sku, vl.description, vl.upc ?? sol.upc, sol.need, vl.cents ?? 0]);
      await event(c, po.id, uid, "line_added", { line_no: n, description: vl.description, qty: sol.need, unit_cost_cents: vl.cents, sales_order_line: sol.line_no });
    }
    await orderEvent(c, orderId, uid, "purchased", { po_id: po.id, number: po.number, vendor_id: vendorId, lines: rows.length });
    made.push({ ...po, vendor_id: vendorId, lines: rows.length });
  }
  return { purchase_orders: made, skipped };
}

export async function updatePurchaseOrder(c: pg.PoolClient, uid: string, id: string, x: z.infer<typeof poSchema>) {
  const b = (await c.query(`SELECT * FROM perfume.purchase_orders WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!b) throw new PoNotFound();
  const keep = <T>(v: T | undefined, old: T) => (v !== undefined ? v : old);
  await c.query(`UPDATE perfume.purchase_orders SET order_date = $2, expected_by = $3, currency = $4, terms = $5, notes = $6, updated_at = now() WHERE id = $1`,
    [id, x.order_date ?? b.order_date, keep(x.expected_by, b.expected_by), x.currency ?? b.currency, keep(x.terms, b.terms), keep(x.notes, b.notes)]);
  await event(c, id, uid, "edited", { fields: Object.keys(x).filter((k) => x[k as keyof typeof x] !== undefined && k !== "vendor_id") });
}

/** Open ↔ cancelled by hand; "received" comes from the lines, never typed. */
export async function setPurchaseOrderStatus(c: pg.PoolClient, uid: string, id: string, status: "open" | "cancelled") {
  const r = (await c.query<{ status: PoStatus; got: number }>(
    `SELECT status, (SELECT coalesce(sum(qty_received), 0)::int FROM perfume.purchase_order_lines WHERE po_id = $1 AND archived_at IS NULL) AS got
       FROM perfume.purchase_orders WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!r) throw new PoNotFound();
  if (r.status === status) return;
  if (r.status === "received") throw new PoInvalid("A received PO is not reopened or cancelled.");
  if (status === "cancelled" && r.got > 0) throw new PoInvalid("Pieces were already received on this PO.");
  await c.query(`UPDATE perfume.purchase_orders SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await event(c, id, uid, "status", { from: r.status, to: status });
}

async function refreshReceived(c: pg.PoolClient, uid: string, poId: string) {
  const r = (await c.query<{ open: number; lines: number; status: PoStatus }>(
    `SELECT (SELECT count(*)::int FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL AND l.qty_received < l.qty) AS open,
            (SELECT count(*)::int FROM perfume.purchase_order_lines l WHERE l.po_id = p.id AND l.archived_at IS NULL) AS lines, p.status
       FROM perfume.purchase_orders p WHERE p.id = $1`, [poId])).rows[0]!;
  const next: PoStatus = r.lines > 0 && r.open === 0 ? "received" : r.status === "received" ? "open" : r.status;
  if (next !== r.status) {
    await c.query(`UPDATE perfume.purchase_orders SET status = $2, updated_at = now() WHERE id = $1`, [poId, next]);
    await event(c, poId, uid, "status", { from: r.status, to: next });
  }
}

async function assertEditable(c: pg.PoolClient, poId: string) {
  const s = (await c.query<{ status: PoStatus; vendor_id: string }>(`SELECT status, vendor_id FROM perfume.purchase_orders WHERE id = $1 AND archived_at IS NULL`, [poId])).rows[0];
  if (!s) throw new PoNotFound();
  if (s.status === "cancelled") throw new PoInvalid("The PO is cancelled.");
  return s;
}

/** A line by hand: an item takes this vendor's own code, words and price from their current list; else type it. */
export async function addPurchaseLine(c: pg.PoolClient, uid: string, poId: string, x: z.infer<typeof poLineSchema>) {
  const po = await assertEditable(c, poId);
  let description = x.description, upc = x.upc, sku = x.vendor_sku, unit = x.unit_cost_cents, rowId: string | null = null;
  if (x.item_id) {
    const it = await itemFacts(c, x.item_id);
    if (!it) throw new PoInvalid("That item is not on the desk.");
    const vl = await vendorLineOf(c, po.vendor_id, x.item_id);
    rowId = vl?.row_id ?? null;
    description = description ?? vl?.description ?? it.display_name; upc = upc ?? vl?.upc ?? it.upc; sku = sku ?? vl?.sku ?? null;
    unit = unit ?? vl?.cents ?? undefined;
  }
  if (!description) throw new PoInvalid("A line needs an item or a description.");
  if (unit === undefined) throw new PoInvalid("This vendor has no current price for it — type the cost.");
  const no = (await c.query<{ n: number }>(`SELECT coalesce(max(line_no), 0)::int + 1 AS n FROM perfume.purchase_order_lines WHERE po_id = $1`, [poId])).rows[0]!.n;
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.purchase_order_lines (po_id, line_no, item_id, price_list_row_id, vendor_sku, description, upc, qty, unit_cost_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [poId, no, x.item_id ?? null, rowId, sku, description, upc, x.qty, unit]);
  await event(c, poId, uid, "line_added", { line_no: no, description, qty: x.qty, unit_cost_cents: unit });
  await refreshReceived(c, uid, poId);
  return { id: r.rows[0]!.id, unit_cost_cents: unit };
}

export async function updatePurchaseLine(c: pg.PoolClient, uid: string, lineId: string, x: z.infer<typeof poLinePatchSchema>) {
  const b = (await c.query(`SELECT po_id, line_no, qty, qty_received, unit_cost_cents FROM perfume.purchase_order_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!b) throw new PoNotFound();
  await assertEditable(c, b.po_id);
  const qty = x.qty ?? b.qty, got = x.qty_received ?? b.qty_received;
  if (got > qty) throw new PoInvalid("Received cannot be more than ordered.");
  await c.query(`UPDATE perfume.purchase_order_lines SET qty = $2, qty_received = $3, unit_cost_cents = coalesce($4, unit_cost_cents), updated_at = now() WHERE id = $1`,
    [lineId, qty, got, x.unit_cost_cents ?? null]);
  if (x.qty_received !== undefined && x.qty_received !== b.qty_received) await event(c, b.po_id, uid, "received", { line_no: b.line_no, from: b.qty_received, to: x.qty_received });
  if ((x.qty !== undefined && x.qty !== b.qty) || (x.unit_cost_cents !== undefined && x.unit_cost_cents !== Number(b.unit_cost_cents))) {
    await event(c, b.po_id, uid, "line_changed", { line_no: b.line_no, from: { qty: b.qty, unit_cost_cents: Number(b.unit_cost_cents) }, to: { qty: x.qty, unit_cost_cents: x.unit_cost_cents } });
  }
  await refreshReceived(c, uid, b.po_id);
}

export async function receiveAll(c: pg.PoolClient, uid: string, poId: string) {
  await assertEditable(c, poId);
  const open = (await c.query<{ id: string; line_no: number; qty: number; qty_received: number }>(
    `SELECT id, line_no, qty, qty_received FROM perfume.purchase_order_lines WHERE po_id = $1 AND archived_at IS NULL AND qty_received < qty ORDER BY line_no`, [poId])).rows;
  for (const l of open) {
    await c.query(`UPDATE perfume.purchase_order_lines SET qty_received = qty, updated_at = now() WHERE id = $1`, [l.id]);
    await event(c, poId, uid, "received", { line_no: l.line_no, from: l.qty_received, to: l.qty });
  }
  await refreshReceived(c, uid, poId);
  return { lines: open.length };
}

export async function removePurchaseLine(c: pg.PoolClient, uid: string, lineId: string) {
  const b = (await c.query(`SELECT po_id, line_no, description, qty_received FROM perfume.purchase_order_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!b) throw new PoNotFound();
  await assertEditable(c, b.po_id);
  if (b.qty_received > 0) throw new PoInvalid("A line with received pieces is not taken off.");
  await c.query(`UPDATE perfume.purchase_order_lines SET archived_at = now(), updated_at = now() WHERE id = $1`, [lineId]);
  await event(c, b.po_id, uid, "line_removed", { line_no: b.line_no, description: b.description });
  await refreshReceived(c, uid, b.po_id);
}

export async function archivePurchaseOrder(c: pg.PoolClient, uid: string, id: string) {
  const got = (await c.query<{ got: number }>(`SELECT coalesce(sum(qty_received), 0)::int AS got FROM perfume.purchase_order_lines WHERE po_id = $1 AND archived_at IS NULL`, [id])).rows[0]?.got ?? 0;
  if (got > 0) throw new PoInvalid("Pieces were already received on this PO.");
  const r = await c.query(`UPDATE perfume.purchase_orders SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [id]);
  if (!r.rowCount) throw new PoNotFound();
  await event(c, id, uid, "edited", { archived: true });
}

/* ------------------------------------------------------------------ Excel + PDF */

export async function purchaseOrderXlsx(c: pg.PoolClient, uid: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const p = await getPurchaseOrder(c, id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(p.number);
  ws.columns = [{ width: 6 }, { width: 18 }, { width: 60 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 16 }];
  ws.addRow(["TIO Perfumes (ScentsX LLC)"]).font = { bold: true, size: 14, name: "Arial" };
  ws.addRow([`Purchase order ${p.number}${p.sales_order_number ? ` (for sales order ${p.sales_order_number})` : ""}`]).font = { bold: true, name: "Arial" };
  ws.addRow([`Vendor: ${p.vendor_name}${p.vendor_contact ? ` · ${p.vendor_contact}` : ""}`]);
  ws.addRow([`Order date: ${usDate(p.order_date)}${p.expected_by ? `   Expected by: ${usDate(p.expected_by)}` : ""}   Status: ${p.status}   Currency: ${p.currency}`]);
  ws.addRow([]);
  ws.addRow(["#", "Your code", "Item", "UPC", "Qty", "Received", "Unit cost", "Total"]).font = { bold: true, name: "Arial" };
  const first = ws.rowCount + 1;
  for (const l of p.lines) {
    const r = ws.addRow([l.line_no, l.vendor_sku ?? "", l.description, l.upc ?? "", l.qty, l.qty_received, l.unit_cost_cents / 100, null]);
    r.getCell(8).value = { formula: `E${r.number}*G${r.number}` };
  }
  const last = Math.max(first, ws.rowCount);
  const tot = ws.addRow(["", "", "", "", { formula: `SUM(E${first}:E${last})` }, { formula: `SUM(F${first}:F${last})` }, "Total", { formula: `SUM(H${first}:H${last})` }]);
  tot.font = { bold: true, name: "Arial" };
  const fmt = p.currency === "MXN" ? '"MX$"#,##0.00' : '"$"#,##0.00';
  for (let i = first; i <= tot.number; i++) { ws.getCell(`G${i}`).numFmt = fmt; ws.getCell(`H${i}`).numFmt = fmt; }
  if (p.terms) { ws.addRow([]); ws.addRow([`Terms: ${p.terms}`]); }
  if (p.notes) ws.addRow([`Notes: ${p.notes}`]);
  ws.eachRow((row) => row.eachCell((cell) => { cell.font = { ...(cell.font ?? {}), name: "Arial" }; }));
  await event(c, id, uid, "exported_xlsx", {});
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${p.number} ${p.vendor_name}.xlsx`.replace(/[^\w .-]+/g, "") };
}

export function purchaseOrderHtml(p: PoFull): string {
  const rows = p.lines.map((l) => `<tr><td>${l.line_no}</td><td>${esc(l.vendor_sku ?? "")}</td><td>${esc(l.description)}</td><td>${esc(l.upc ?? "")}</td>
    <td class="n">${l.qty.toLocaleString("en-US")}</td><td class="n">${money(l.unit_cost_cents, p.currency)}</td><td class="n">${money(l.qty * l.unit_cost_cents, p.currency)}</td></tr>`).join("");
  const total = p.lines.reduce((t, l) => t + l.qty * l.unit_cost_cents, 0);
  const units = p.lines.reduce((t, l) => t + l.qty, 0);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1F2A44;font-size:11px;margin:28px}
    h1{font-size:18px;margin:0}h2{font-size:13px;margin:4px 0 14px;color:#14314F}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #14314F;padding-bottom:8px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th{background:#14314F;color:#fff;text-align:left;padding:5px}
    td{border-bottom:1px solid #D8E0E8;padding:4px 5px}.n{text-align:right;white-space:nowrap}
    tfoot td{font-weight:bold;border-top:2px solid #14314F}.muted{color:#5A6B7F}
  </style></head><body>
  <div class="top"><div><h1>TIO Perfumes</h1><div class="muted">ScentsX LLC · Laredo, TX</div></div>
  <div style="text-align:right"><h2>Purchase order ${esc(p.number)}</h2><div>Order date: ${usDate(p.order_date)}</div>${p.expected_by ? `<div>Expected by: ${usDate(p.expected_by)}</div>` : ""}<div>Currency: ${esc(p.currency)}</div></div></div>
  <div style="margin-bottom:12px"><b>Vendor:</b> ${esc(p.vendor_name)}${p.vendor_contact ? ` · ${esc(p.vendor_contact)}` : ""}</div>
  <table><thead><tr><th>#</th><th>Your code</th><th>Item</th><th>UPC</th><th class="n">Qty</th><th class="n">Unit cost</th><th class="n">Total</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td></td><td></td><td>${p.lines.length} line${p.lines.length === 1 ? "" : "s"}</td><td></td><td class="n">${units.toLocaleString("en-US")}</td><td class="n">Total</td><td class="n">${money(total, p.currency)}</td></tr></tfoot></table>
  ${p.terms ? `<p><b>Terms:</b> ${esc(p.terms)}</p>` : ""}${p.notes ? `<p><b>Notes:</b> ${esc(p.notes)}</p>` : ""}
  </body></html>`;
}

export async function purchaseOrderPdf(c: pg.PoolClient, uid: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const p = await getPurchaseOrder(c, id);
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setContent(purchaseOrderHtml(p), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    await event(c, id, uid, "exported_pdf", {});
    return { buffer: Buffer.from(pdf), filename: `${p.number} ${p.vendor_name}.pdf`.replace(/[^\w .-]+/g, "") };
  } finally { await browser.close(); }
}

/** The PO list (same filters) as one workbook. */
export async function purchaseOrdersListXlsx(c: pg.PoolClient, f: Parameters<typeof listPurchaseOrders>[1] = {}) {
  const rows = await listPurchaseOrders(c, f);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Purchase orders");
  ws.columns = [{ header: "PO", width: 12 }, { header: "Vendor", width: 34 }, { header: "Sales order", width: 12 }, { header: "Date", width: 12 }, { header: "Expected", width: 12 },
    { header: "Status", width: 11 }, { header: "Lines", width: 8 }, { header: "Units", width: 9 }, { header: "Received", width: 10 }, { header: "Total", width: 14 }];
  for (const r of rows) ws.addRow([r.number, r.vendor_name, r.sales_order_number ?? "", usDate(r.order_date), usDate(r.expected_by), r.status, r.lines, r.units, r.units_received, Number(r.total_cents) / 100]);
  ws.getColumn(10).numFmt = '"$"#,##0.00';
  ws.getRow(1).font = { bold: true, name: "Arial" };
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: "Purchase orders.xlsx" };
}
