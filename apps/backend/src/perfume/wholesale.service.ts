/**
 * PERFUME wholesale lists — owner 2026-11-27 08:10 CT "lists wholesale lists etc we need to make this more efficient and professional".
 * A price list for one price level (Retail / Wholesale / Distributor / Export Mexico, or any he adds): every one of OUR items (in stock
 * at an own site or on my inventory / offer list), with its price at that level — the level's fixed price breaks first (12+ / 48+ …),
 * else the level's rule (markup / margin on average cost, or on the best supplier price) — plus what a wholesale buyer needs: UPC, case
 * pack, minimum order, units available, family, category, product type, size, EDT / EDP / Parfum, gender, origin, HS code.
 * The SAME pricing the sales order uses (levelPriceFor's rules), read in bulk. Read only — nothing is written.
 */
import type pg from "pg";
import { z } from "zod";
import { priceFromCost } from "./pricing.js";

export class WholesaleInvalid extends Error {}

export const wholesaleQuery = z.object({
  level_id: z.string().uuid(),
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  family_id: z.string().uuid().optional(),
  in_stock: z.enum(["1"]).optional(),
});

export type WholesaleRow = {
  item_id: string; tio_code: string | null; display_name: string; brand: string; family: string | null; category: string | null; product_type: string | null;
  size_ml: number | null; conc: string | null; gender: string | null; upc: string | null; case_pack: number | null; min_order_qty: number | null; available: number;
  origin_country: string | null; hs_code: string | null; price_cents: number | null; case_price_cents: number | null; price_from: "fixed" | "rule" | null;
  breaks: Array<{ min_qty: number; price_cents: number }>; price_set_on: string | null;
};

const MINE = `('inventory', 'offer')`;

export async function wholesaleList(c: pg.PoolClient, f: z.infer<typeof wholesaleQuery>) {
  const level = (await c.query<{ id: string; name: string; channel: string; method: "markup" | "margin"; pct: string | null; cost_basis: "avg" | "best_vendor"; active: boolean }>(
    `SELECT id, name, channel, method, pct::text, cost_basis, active FROM perfume.price_levels WHERE id = $1`, [f.level_id])).rows[0];
  if (!level) throw new WholesaleInvalid("That price level is not on the desk.");
  const args: unknown[] = [f.level_id];
  const where = ["i.merged_into_id IS NULL", `(coalesce(st.on_hand, 0) > 0 OR EXISTS (SELECT 1 FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      JOIN perfume.vendors v ON v.id = l.vendor_id WHERE r.item_id = i.id AND v.kind IN ${MINE} AND l.is_current AND l.voided_at IS NULL))`];
  if (f.q) { args.push(`%${f.q.toLowerCase()}%`); where.push(`(lower(i.display_name) LIKE $${args.length} OR lower(coalesce(i.internal_code, '')) LIKE $${args.length})`); }
  if (f.category) { args.push(f.category); where.push(`lower(i.category) = lower($${args.length})`); }
  if (f.family_id) { args.push(f.family_id); where.push(`i.family_id = $${args.length}::uuid`); }
  if (f.in_stock) where.push("coalesce(st.on_hand, 0) > 0");
  const rows = (await c.query<{
    item_id: string; tio_code: string | null; display_name: string; brand: string; family: string | null; category: string | null; product_type: string | null;
    size_ml: number | null; conc: string | null; gender: string | null; upc: string | null; case_pack: number | null; min_order_qty: number | null; available: number;
    origin_country: string | null; hs_code: string | null; breaks: Array<{ min_qty: number; price_cents: number }> | null; avg_cost: string | null; best_vendor: string | null;
    price_set_on: string | null;
  }>(
    `WITH st AS (
       SELECT s.item_id, sum(s.qty)::int AS on_hand, (sum(s.qty * s.avg_cost_cents) FILTER (WHERE s.qty > 0) / nullif(sum(s.qty) FILTER (WHERE s.qty > 0), 0)) AS stock_avg
         FROM perfume.item_stock s JOIN perfume.locations l ON l.code = s.location_code AND l.own GROUP BY s.item_id)
     SELECT i.id AS item_id, i.internal_code AS tio_code, i.display_name, i.brand, f.name AS family, i.category, i.product_type, i.size_ml::float8 AS size_ml,
            i.conc, i.gender, (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = i.id ORDER BY u.upc LIMIT 1) AS upc, i.case_pack, i.min_order_qty,
            greatest(coalesce(st.on_hand, 0), 0) AS available, i.origin_country, i.hs_code,
            (SELECT json_agg(json_build_object('min_qty', p.min_qty, 'price_cents', p.price_cents) ORDER BY p.min_qty) FROM perfume.price_level_items p
              WHERE p.level_id = $1 AND p.item_id = i.id AND p.archived_at IS NULL) AS breaks,
            (SELECT max(p.updated_at)::date::text FROM perfume.price_level_items p WHERE p.level_id = $1 AND p.item_id = i.id AND p.archived_at IS NULL) AS price_set_on,
            coalesce(st.stock_avg, (SELECT k.avg_cost_cents FROM perfume.item_costs k WHERE k.item_id = i.id AND k.avg_cost_cents > 0),
              (SELECT avg(r.price_cents) FROM perfume.price_lists l2 JOIN perfume.vendors v ON v.id = l2.vendor_id JOIN perfume.price_list_rows r ON r.list_id = l2.id
                WHERE v.kind = 'inventory' AND l2.is_current AND l2.voided_at IS NULL AND r.item_id = i.id AND r.price_cents >= 100))::text AS avg_cost,
            (SELECT min(r.price_cents) FROM perfume.price_list_rows r JOIN perfume.price_lists l3 ON l3.id = r.list_id JOIN perfume.vendors v ON v.id = l3.vendor_id
              WHERE r.item_id = i.id AND l3.is_current AND l3.voided_at IS NULL AND r.price_cents > 0 AND v.kind IN ('buy', 'both') AND v.archived_at IS NULL)::text AS best_vendor
       FROM perfume.items i LEFT JOIN st ON st.item_id = i.id LEFT JOIN perfume.item_families f ON f.id = i.family_id
      WHERE ${where.join(" AND ")}
      ORDER BY lower(i.brand), lower(i.display_name) LIMIT 10000`, args)).rows;
  const out: WholesaleRow[] = rows.map((r) => {
    const breaks = (r.breaks ?? []).map((b) => ({ min_qty: Number(b.min_qty), price_cents: Number(b.price_cents) }));
    // The price at the item's minimum order (or 1): a fixed break when one applies, else the level's rule — as levelPriceFor does.
    const atQty = Math.max(1, r.min_order_qty ?? 1);
    const fixed = [...breaks].filter((b) => b.min_qty <= atQty).pop();
    let price: number | null = fixed ? fixed.price_cents : null;
    let from: WholesaleRow["price_from"] = fixed ? "fixed" : null;
    if (price == null && level.pct != null) {
      const cost = level.cost_basis === "avg" ? (r.avg_cost != null ? Math.round(Number(r.avg_cost)) : r.best_vendor != null ? Number(r.best_vendor) : null)
        : (r.best_vendor != null ? Number(r.best_vendor) : null);
      if (cost != null && cost > 0) { price = priceFromCost(cost, Number(level.pct), level.method); from = "rule"; }
    }
    return { item_id: r.item_id, tio_code: r.tio_code, display_name: r.display_name, brand: r.brand, family: r.family, category: r.category, product_type: r.product_type,
      size_ml: r.size_ml, conc: r.conc, gender: r.gender, upc: r.upc, case_pack: r.case_pack, min_order_qty: r.min_order_qty, available: r.available,
      origin_country: r.origin_country, hs_code: r.hs_code, price_cents: price, case_price_cents: price != null && r.case_pack ? price * r.case_pack : null, price_from: from, breaks, price_set_on: r.price_set_on };
  });
  return { level: { id: level.id, name: level.name, channel: level.channel, active: level.active }, rows: out, priced: out.filter((r) => r.price_cents != null).length };
}
