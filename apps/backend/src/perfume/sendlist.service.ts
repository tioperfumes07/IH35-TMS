/**
 * PERFUME-SEND-LIST (owner 2026-11-26 23:23 CT): "WHEN SENDING LIST REMEMBER WE CAN SELECT WHAT TO SHOW, SO WE CAN ADD OR REMOVE
 * RESTRICTED BRANDS, UPC SKUS, ETC." and earlier: "some brands/items are duty free and restricted (cannot be sold online, not for
 * export); his lists must exclude restricted items".
 *
 * The list he sends is built from OUR items (his current inventory file + offer list): he picks the columns (description, brand,
 * type, size, UPC, TIO code, HK code, quantity, my list price, a price level's price), which sites' stock counts, and leaves out the
 * restricted brands / items (kept in perfume.settings.rules: restricted_brands, restricted_item_ids) plus any brand he unticks for
 * this one list. Out comes an Excel; it can be attached straight to a campaign. Set-based: one query per table, never per item.
 * Nothing is sent from here and nothing posts to accounting.
 */
import type pg from "pg";
import ExcelJS from "exceljs";
import { z } from "zod";
import { categoryOf } from "./normalize.js";
import { roundRule, sellingPrice } from "./selling-price.js";

export class SendListInvalid extends Error {}

export const SEND_COLUMNS = ["description", "brand", "category", "size", "conc", "upc", "tio_code", "hk_code", "qty", "my_price", "level_price"] as const;
export type SendColumn = (typeof SEND_COLUMNS)[number];
const LABEL: Record<SendColumn, string> = { description: "Description", brand: "Brand", category: "Type", size: "Size ml", conc: "Concentration", upc: "UPC",
  tio_code: "TIO code", hk_code: "HK code", qty: "Qty", my_price: "Price", level_price: "Price" };

export const sendListSchema = z.object({
  columns: z.array(z.enum(SEND_COLUMNS)).min(1).max(SEND_COLUMNS.length),
  /** Price column source: my list price (offer list) or a price level's price on my cost. */
  level_id: z.string().uuid().nullable().optional(),
  /** Site codes whose stock counts; empty = every site. */
  sites: z.array(z.string().min(1).max(40)).max(50).default([]),
  in_stock_only: z.boolean().default(true),
  /** Leave out the restricted brands / items saved in settings (default yes). */
  exclude_restricted: z.boolean().default(true),
  /** Brands left out of this one list. */
  exclude_brands: z.array(z.string().trim().min(1).max(80)).max(500).default([]),
  /** Only these categories (Men, Women, Tester Women…); empty = all. */
  categories: z.array(z.string().max(40)).max(20).default([]),
  title: z.string().trim().max(120).optional(),
});
export type SendListInput = z.infer<typeof sendListSchema>;

/* ------------------------------------------------------------------ restricted brands / items */

export async function getRestricted(c: pg.PoolClient) {
  const r = (await c.query<{ b: string[] | null; i: string[] | null }>(
    `SELECT ARRAY(SELECT jsonb_array_elements_text(coalesce(rules->'restricted_brands', '[]'::jsonb))) AS b,
            ARRAY(SELECT jsonb_array_elements_text(coalesce(rules->'restricted_item_ids', '[]'::jsonb))) AS i
       FROM perfume.settings WHERE id = 1`)).rows[0];
  const ids = r?.i ?? [];
  const items = ids.length ? (await c.query<{ id: string; display_name: string }>(`SELECT id, display_name FROM perfume.items WHERE id = ANY($1::uuid[]) ORDER BY display_name`, [ids])).rows : [];
  return { brands: (r?.b ?? []).sort(), items };
}
export const restrictedSchema = z.object({ brands: z.array(z.string().trim().min(1).max(80)).max(500), item_ids: z.array(z.string().uuid()).max(5000) });
export async function setRestricted(c: pg.PoolClient, uid: string, x: z.infer<typeof restrictedSchema>) {
  const brands = [...new Set(x.brands.map((b) => b.toUpperCase()))].sort();
  const ids = [...new Set(x.item_ids)];
  await c.query(
    `INSERT INTO perfume.settings (id, rules, updated_by, updated_at) VALUES (1, jsonb_build_object('restricted_brands', $1::jsonb, 'restricted_item_ids', $2::jsonb), $3, now())
     ON CONFLICT (id) DO UPDATE SET rules = perfume.settings.rules || jsonb_build_object('restricted_brands', $1::jsonb, 'restricted_item_ids', $2::jsonb), updated_by = $3, updated_at = now()`,
    [JSON.stringify(brands), JSON.stringify(ids), uid]);
  return getRestricted(c);
}

/* ------------------------------------------------------------------ our items, with everything a list can show */

type Row = { item_id: string; description: string; brand: string; category: string; size: number | null; conc: string; upc: string; tio_code: string; hk_code: string;
  qty: number; my_price: number | null; level_price: number | null };

export async function buildSendList(c: pg.PoolClient, x: SendListInput) {
  const restricted = x.exclude_restricted ? await getRestricted(c) : { brands: [], items: [] };
  const outBrands = new Set([...restricted.brands, ...x.exclude_brands.map((b) => b.toUpperCase())]);
  const outItems = new Set(restricted.items.map((i) => i.id));
  // Our items: every item on my current inventory file or offer list, with the stock of the chosen sites and my list price.
  const base = (await c.query<{ item_id: string; display_name: string; brand: string; size_ml: string | null; conc: string | null; gender: string | null; flags: string[] | null;
    tio_code: string | null; inv_desc: string | null; offer_desc: string | null; hk: string | null; qty: number; offer_cents: number | null }>(
    `WITH cur AS (
       SELECT r.item_id, v.kind, r.description, r.sku, r.price_cents, r.qty, r.qty_by_location FROM perfume.price_list_rows r
         JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL JOIN perfume.vendors v ON v.id = l.vendor_id
        WHERE r.item_id IS NOT NULL AND v.kind IN ('inventory', 'offer')),
     stock AS (
       SELECT item_id, sum(CASE WHEN cardinality($1::text[]) = 0 THEN coalesce(qty, 0)
                                ELSE (SELECT coalesce(sum((k.value)::int), 0) FROM jsonb_each_text(coalesce(qty_by_location, '{}'::jsonb)) k
                                       WHERE k.key = ANY($1::text[]) AND k.value ~ '^-?[0-9]+$') END)::int AS qty,
              min(description) AS inv_desc, min(sku) AS hk
         FROM cur WHERE kind = 'inventory' GROUP BY item_id),
     offer AS (SELECT item_id, min(price_cents)::int AS offer_cents, min(description) AS offer_desc, min(sku) AS hk FROM cur WHERE kind = 'offer' GROUP BY item_id)
     SELECT i.id AS item_id, i.display_name, i.brand, i.size_ml::text, i.conc, i.gender, i.flags, i.internal_code AS tio_code,
            s.inv_desc, o.offer_desc, coalesce(s.hk, o.hk) AS hk, coalesce(s.qty, 0) AS qty, o.offer_cents
       FROM perfume.items i LEFT JOIN stock s ON s.item_id = i.id LEFT JOIN offer o ON o.item_id = i.id
      WHERE (s.item_id IS NOT NULL OR o.item_id IS NOT NULL) AND i.merged_into_id IS NULL`, [x.sites])).rows;
  const ids = base.map((b) => b.item_id);
  const upcs = ids.length ? new Map((await c.query<{ item_id: string; upc: string }>(
    `SELECT item_id, min(upc) AS upc FROM perfume.item_upcs WHERE item_id = ANY($1::uuid[]) GROUP BY item_id`, [ids])).rows.map((r) => [r.item_id, r.upc])) : new Map<string, string>();

  let levelPrice = new Map<string, number>();
  let levelName: string | null = null;
  if (x.level_id && x.columns.includes("level_price")) {
    const lv = (await c.query<{ name: string; method: "markup" | "margin"; pct: string | null; cost_basis: "avg" | "best_vendor" }>(
      `SELECT name, method, pct::text, cost_basis FROM perfume.price_levels WHERE id = $1 AND active`, [x.level_id])).rows[0];
    if (!lv) throw new SendListInvalid("That price level is not active.");
    levelName = lv.name;
    // The same cost order the level uses on a quote: stock average, my avg cost, my inventory file's last cost ($1+), best supplier.
    const costs = (await c.query<{ item_id: string; stock: string | null; mine: number | null }>(
      `WITH ids AS (SELECT unnest($1::uuid[]) AS item_id)
       SELECT ids.item_id,
              (SELECT (sum(qty * avg_cost_cents) / nullif(sum(qty), 0))::text FROM perfume.item_stock s WHERE s.item_id = ids.item_id AND s.qty > 0) AS stock,
              (SELECT avg_cost_cents FROM perfume.item_costs ic WHERE ic.item_id = ids.item_id AND avg_cost_cents > 0) AS mine FROM ids`, [ids])).rows;
    const lines = (await c.query<{ item_id: string; file: string | null; best: number | null }>(
      `SELECT r.item_id, avg(r.price_cents) FILTER (WHERE v.kind = 'inventory' AND r.price_cents >= 100)::text AS file,
              min(r.price_cents) FILTER (WHERE v.kind = 'buy' AND r.price_cents > 0)::int AS best
         FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL JOIN perfume.vendors v ON v.id = l.vendor_id
        WHERE r.item_id = ANY($1::uuid[]) GROUP BY r.item_id`, [ids])).rows;
    const L = new Map(lines.map((l) => [l.item_id, l]));
    const fixed = new Map((await c.query<{ item_id: string; price_cents: number }>(
      `SELECT DISTINCT ON (item_id) item_id, price_cents::int FROM perfume.price_level_items WHERE level_id = $1 AND archived_at IS NULL AND min_qty <= 1 ORDER BY item_id, min_qty DESC`,
      [x.level_id])).rows.map((r) => [r.item_id, r.price_cents]));
    levelPrice = new Map();
    const rule = await roundRule(c); // calculated prices close by the desk rounding rule (owner 2026-11-27 15:40 CT)
    for (const k of costs) {
      const f = fixed.get(k.item_id);
      if (f != null) { levelPrice.set(k.item_id, f); continue; }
      if (lv.pct == null) continue;
      const l = L.get(k.item_id);
      const cost = lv.cost_basis === "avg"
        ? (k.stock != null ? Math.round(Number(k.stock)) : k.mine ?? (l?.file != null ? Math.round(Number(l.file)) : l?.best ?? null))
        : l?.best ?? null;
      if (cost != null) levelPrice.set(k.item_id, sellingPrice(cost, Number(lv.pct), lv.method, rule));
    }
  }

  const rows: Row[] = [];
  let leftOutRestricted = 0, leftOutBrand = 0, leftOutNoStock = 0, leftOutCategory = 0;
  for (const b of base) {
    const brand = (b.brand ?? "").toUpperCase();
    if (outItems.has(b.item_id) || restricted.brands.includes(brand)) { leftOutRestricted++; continue; }
    if (outBrands.has(brand)) { leftOutBrand++; continue; }
    if (x.in_stock_only && b.qty <= 0) { leftOutNoStock++; continue; }
    const category = categoryOf(b.gender, b.flags);
    if (x.categories.length && !x.categories.includes(category)) { leftOutCategory++; continue; }
    rows.push({ item_id: b.item_id, description: b.offer_desc ?? b.inv_desc ?? b.display_name, brand: b.brand ?? "", category, size: b.size_ml == null ? null : Number(b.size_ml),
      conc: b.conc ?? "", upc: upcs.get(b.item_id) ?? "", tio_code: b.tio_code ?? "", hk_code: b.hk ?? "", qty: b.qty, my_price: b.offer_cents, level_price: levelPrice.get(b.item_id) ?? null });
  }
  rows.sort((a, b) => a.brand.localeCompare(b.brand) || a.description.localeCompare(b.description));
  return { rows, level: levelName, our_items: base.length, left_out: { restricted: leftOutRestricted, brand: leftOutBrand, no_stock: leftOutNoStock, category: leftOutCategory },
    brands: [...new Set(base.map((b) => (b.brand ?? "").toUpperCase()).filter(Boolean))].sort() };
}

/** The Excel he sends: only the columns he picked, in his order; prices as money; UPC / codes as text (never 8.12E+11). */
export async function sendListXlsx(c: pg.PoolClient, x: SendListInput): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const b = await buildSendList(c, x);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("TIO Perfumes");
  const title = x.title?.trim() || "TIO Perfumes price list";
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  ws.addRow([`${title} — ${today}`]).font = { bold: true, name: "Arial", size: 13 };
  ws.addRow([]);
  const head = ws.addRow(x.columns.map((k) => (k === "level_price" && b.level ? `Price (${b.level})` : LABEL[k])));
  head.font = { bold: true, name: "Arial" };
  for (const r of b.rows) {
    ws.addRow(x.columns.map((k) => {
      const v = r[k];
      if (k === "my_price" || k === "level_price") return v == null ? "" : Number(v) / 100;
      return v ?? "";
    }));
  }
  x.columns.forEach((k, i) => {
    const col = ws.getColumn(i + 1);
    col.width = k === "description" ? 56 : k === "brand" ? 20 : k === "upc" ? 16 : 12;
    if (k === "my_price" || k === "level_price") col.numFmt = '"$"#,##0.00';
    if (k === "upc" || k === "tio_code" || k === "hk_code") col.numFmt = "@";
    col.alignment = { horizontal: k === "my_price" || k === "level_price" || k === "qty" || k === "size" ? "right" : "left" };
  });
  const safe = title.replace(/[^A-Za-z0-9 ._-]/g, "").trim() || "TIO price list";
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${safe}.xlsx`, rows: b.rows.length };
}
