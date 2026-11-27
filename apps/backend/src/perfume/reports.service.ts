/**
 * PERFUME inquiry screens and reports (LEAD ROUND L.20 items 2, 4, 5, 6; owner 2026-11-27 13:50 CT "bring what we need from CONTROL
 * into the app"). CONTROL's Items Inquiry, Price Book, Inventory Status and Product Family report, read from the perfume schema only:
 *   - Items inquiry: one item card — every code on the left; Retail + each price level, special and minimum price, average and last
 *     cost, quantity on hand, last receipt date and inventory value on the right.
 *   - Price book: items by product family or TIO code range, at one price level, with or without on-hand = 0.
 *   - Inventory status: on hand and value by item, by family or code range, with or without on-hand = 0, totals at the bottom.
 *   - Product family report: each family with item count, units on hand and value.
 * Read only: nothing is written. Prices come from accounts.service priceAtLevel (the same rule an order line uses). Value = on hand ×
 * average cost per site (perfume.item_stock). No money posting, no GL.
 */
import type pg from "pg";
import { z } from "zod";
import { avgCostOf, bestBuyCents, priceAtLevel } from "./accounts.service.js";

export class ReportInvalid extends Error {}
export class ReportNotFound extends Error { constructor() { super("not_found"); } }

type LevelRow = Parameters<typeof priceAtLevel>[1];
async function activeLevels(c: pg.PoolClient): Promise<LevelRow[]> {
  return (await c.query<LevelRow>(
    `SELECT id, name, method, pct::text, cost_basis, floor_pct::text, tester_pct::text FROM perfume.price_levels WHERE active ORDER BY sort_order, name`)).rows;
}

/* ------------------------------------------------------------------ Items inquiry (one card) */

export async function itemInquiry(c: pg.PoolClient, id: string) {
  const it = (await c.query(
    `SELECT i.id, i.display_name, i.brand, i.name, i.size_ml::float8 AS size_ml, i.conc, i.gender, i.flags, i.product_type, i.category,
            i.internal_code AS tio_code, i.pos_code, i.ticket_description, i.sold_by, i.units_per_pack, i.is_stock_item, i.is_active,
            i.special_price_cents::float8 AS special_price_cents, i.min_price_cents::float8 AS min_price_cents, i.price_locked, i.case_pack,
            i.family_id, (SELECT f.name FROM perfume.item_families f WHERE f.id = i.family_id) AS family,
            i.preferred_vendor_id, (SELECT v.name FROM perfume.vendors v WHERE v.id = i.preferred_vendor_id) AS preferred_vendor,
            i.merged_into_id
       FROM perfume.items i WHERE i.id = $1`, [id])).rows[0];
  if (!it) throw new ReportNotFound();
  if (it.merged_into_id) return { merged_into_id: it.merged_into_id as string };
  const upcs = (await c.query<{ upc: string }>(`SELECT upc FROM perfume.item_upcs WHERE item_id = $1 ORDER BY upc`, [id])).rows.map((r) => r.upc);
  const hk = (await c.query<{ sku: string }>(
    `SELECT DISTINCT a.sku FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id AND v.kind IN ('inventory', 'offer')
      WHERE a.item_id = $1 AND a.sku IS NOT NULL ORDER BY a.sku`, [id])).rows.map((r) => r.sku);
  const best = await bestBuyCents(c, id);
  const prices = [];
  for (const l of await activeLevels(c)) {
    const p = await priceAtLevel(c, l, id, 1, best);
    prices.push({ level_id: l.id, level: l.name, price_cents: p?.cents ?? null, how: p?.how ?? null });
  }
  const avg = await avgCostOf(c, id);
  const stock = (await c.query<{ location_code: string; site: string | null; qty: number; avg_cost_cents: number | null; value_cents: number }>(
    `SELECT s.location_code, (SELECT l.name FROM perfume.locations l WHERE l.code = s.location_code) AS site, s.qty::int AS qty,
            s.avg_cost_cents::float8 AS avg_cost_cents, (greatest(s.qty, 0) * coalesce(s.avg_cost_cents, 0))::float8 AS value_cents
       FROM perfume.item_stock s WHERE s.item_id = $1 AND s.qty <> 0 ORDER BY s.location_code`, [id])).rows;
  const receipt = (await c.query<{ at: string | null; unit_cost_cents: number | null }>(
    `SELECT moved_at::text AS at, unit_cost_cents::float8 AS unit_cost_cents FROM perfume.stock_moves WHERE item_id = $1 AND kind = 'receipt' ORDER BY moved_at DESC, id DESC LIMIT 1`,
    [id])).rows[0];
  const typedLast = (await c.query<{ v: number | null }>(`SELECT last_cost_cents::float8 AS v FROM perfume.item_costs WHERE item_id = $1`, [id])).rows[0]?.v ?? null;
  const onHand = stock.reduce((t, s) => t + s.qty, 0);
  return {
    item: it, codes: { tio_code: it.tio_code, pos_code: it.pos_code, upcs, hk_codes: hk },
    prices, special_price_cents: it.special_price_cents, min_price_cents: it.min_price_cents, best_supplier_cents: best,
    avg_cost_cents: avg?.cents ?? null, avg_cost_source: avg?.source ?? null,
    last_cost_cents: receipt?.unit_cost_cents ?? typedLast, last_cost_source: receipt ? "last_receipt" : typedLast != null ? "my_last_cost" : null,
    last_receipt_at: receipt?.at ?? null, on_hand: onHand, inventory_value_cents: stock.reduce((t, s) => t + s.value_cents, 0), stock,
  };
}

/* ------------------------------------------------------------------ the shared item filter */

const yn = z.preprocess((v) => (v === "Y" || v === "y" || v === "true" || v === true ? true : v === "N" || v === "n" || v === "false" || v === false ? false : v), z.boolean());
export const reportFilter = z.object({
  family_id: z.string().uuid().optional(),
  /** Family name range (CONTROL "from / to family"), inclusive, case-insensitive. */
  family_from: z.string().trim().max(120).optional(),
  family_to: z.string().trim().max(120).optional(),
  /** TIO code range (CONTROL item code from / to), inclusive. */
  code_from: z.string().trim().max(40).optional(),
  code_to: z.string().trim().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  /** Include items with nothing on hand (CONTROL "include on-hand = 0? Y/N"). Default N. */
  zero: yn.default(false),
  /** Active items only (default Y). */
  active_only: yn.default(true),
});
export type ReportFilter = z.infer<typeof reportFilter>;
export const ROW_CAP = 5000;

function itemWhere(f: ReportFilter, args: unknown[]) {
  const w = ["i.merged_into_id IS NULL"];
  if (f.active_only) w.push("i.is_active");
  if (f.family_id) { args.push(f.family_id); w.push(`i.family_id = $${args.length}`); }
  if (f.family_from) { args.push(f.family_from.toLowerCase()); w.push(`lower(fam.name) >= $${args.length}`); }
  if (f.family_to) { args.push(f.family_to.toLowerCase()); w.push(`lower(fam.name) <= $${args.length}`); }
  if (f.code_from) { args.push(f.code_from); w.push(`i.internal_code >= $${args.length}`); }
  if (f.code_to) { args.push(f.code_to); w.push(`i.internal_code <= $${args.length}`); }
  if (f.q) { args.push(`%${f.q.toLowerCase()}%`); w.push(`(lower(i.display_name) LIKE $${args.length} OR i.internal_code = $${args.length + 1} OR upper(i.pos_code) = upper($${args.length + 1}))`); args.push(f.q); }
  if (!f.zero) w.push("coalesce(st.on_hand, 0) <> 0");
  return w.join(" AND ");
}
const STOCK = `LEFT JOIN (SELECT item_id, sum(qty)::int AS on_hand, sum(greatest(qty, 0) * coalesce(avg_cost_cents, 0))::float8 AS value_cents
                             FROM perfume.item_stock GROUP BY item_id) st ON st.item_id = i.id
               LEFT JOIN perfume.item_families fam ON fam.id = i.family_id`;

type StatusRow = { id: string; tio_code: string | null; pos_code: string | null; display_name: string; family: string | null; on_hand: number; avg_cost_cents: number | null; value_cents: number };

/* ------------------------------------------------------------------ Inventory status */

export async function inventoryStatus(c: pg.PoolClient, f: ReportFilter) {
  const args: unknown[] = [];
  const where = itemWhere(f, args);
  const total = (await c.query<{ n: number; on_hand: number; value_cents: number }>(
    `SELECT count(*)::int AS n, coalesce(sum(st.on_hand), 0)::int AS on_hand, coalesce(sum(st.value_cents), 0)::float8 AS value_cents FROM perfume.items i ${STOCK} WHERE ${where}`, args)).rows[0]!;
  const rows = (await c.query<StatusRow>(
    `SELECT i.id, i.internal_code AS tio_code, i.pos_code, i.display_name, fam.name AS family, coalesce(st.on_hand, 0)::int AS on_hand,
            CASE WHEN coalesce(st.on_hand, 0) > 0 THEN round(st.value_cents / st.on_hand)::float8 END AS avg_cost_cents, coalesce(st.value_cents, 0)::float8 AS value_cents
       FROM perfume.items i ${STOCK} WHERE ${where}
      ORDER BY fam.name NULLS LAST, i.internal_code NULLS LAST, i.display_name LIMIT ${ROW_CAP}`, args)).rows;
  return { rows, total: { items: total.n, on_hand: total.on_hand, value_cents: total.value_cents }, truncated: total.n > rows.length };
}

/* ------------------------------------------------------------------ Price book */

export const priceBookQuery = reportFilter.extend({ level_id: z.string().uuid() });
/** Prices are worked one item at a time through priceAtLevel (the order line's own rule), so the book is capped lower. */
export const PRICE_BOOK_CAP = 2000;
export async function priceBook(c: pg.PoolClient, f: z.infer<typeof priceBookQuery>) {
  const level = (await activeLevels(c)).find((l) => l.id === f.level_id);
  if (!level) throw new ReportInvalid("Choose an active price level.");
  const args: unknown[] = [];
  const where = itemWhere(f, args);
  const n = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM perfume.items i ${STOCK} WHERE ${where}`, args)).rows[0]!.n;
  const items = (await c.query<StatusRow & { special_price_cents: number | null; min_price_cents: number | null; size_ml: number | null; upc: string | null }>(
    `SELECT i.id, i.internal_code AS tio_code, i.pos_code, i.display_name, fam.name AS family, i.size_ml::float8 AS size_ml, coalesce(st.on_hand, 0)::int AS on_hand,
            i.special_price_cents::float8 AS special_price_cents, i.min_price_cents::float8 AS min_price_cents,
            (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = i.id ORDER BY u.upc LIMIT 1) AS upc
       FROM perfume.items i ${STOCK} WHERE ${where}
      ORDER BY fam.name NULLS LAST, i.internal_code NULLS LAST, i.display_name LIMIT ${PRICE_BOOK_CAP}`, args)).rows;
  const rows = [];
  for (const r of items) {
    const p = await priceAtLevel(c, level, r.id, 1, await bestBuyCents(c, r.id));
    rows.push({ id: r.id, tio_code: r.tio_code, pos_code: r.pos_code, upc: r.upc, display_name: r.display_name, family: r.family, size_ml: r.size_ml, on_hand: r.on_hand,
      price_cents: p?.cents ?? null, special_price_cents: r.special_price_cents, min_price_cents: r.min_price_cents });
  }
  return { level: { id: level.id, name: level.name }, rows, total: { items: n, priced: rows.filter((r) => r.price_cents != null).length }, truncated: n > rows.length };
}

/* ------------------------------------------------------------------ Product family report */

export async function familyReport(c: pg.PoolClient, f: { active_only: boolean }) {
  const act = f.active_only ? "AND i.is_active" : "";
  const rows = (await c.query<{ family_id: string | null; family: string; brand: string | null; items: number; items_on_hand: number; on_hand: number; value_cents: number }>(
    `SELECT fam.id AS family_id, coalesce(fam.name, '(no family)') AS family, fam.brand, count(i.id)::int AS items,
            count(*) FILTER (WHERE coalesce(st.on_hand, 0) > 0)::int AS items_on_hand, coalesce(sum(st.on_hand), 0)::int AS on_hand,
            coalesce(sum(st.value_cents), 0)::float8 AS value_cents
       FROM perfume.items i ${STOCK}
      WHERE i.merged_into_id IS NULL ${act} AND (fam.id IS NULL OR fam.archived_at IS NULL)
      GROUP BY fam.id, fam.name, fam.brand
      ORDER BY (fam.id IS NULL), fam.name`)).rows;
  const sum = (k: "items" | "items_on_hand" | "on_hand" | "value_cents") => rows.reduce((t, r) => t + Number(r[k]), 0);
  return { rows, total: { families: rows.filter((r) => r.family_id).length, items: sum("items"), items_on_hand: sum("items_on_hand"), on_hand: sum("on_hand"), value_cents: sum("value_cents") } };
}
