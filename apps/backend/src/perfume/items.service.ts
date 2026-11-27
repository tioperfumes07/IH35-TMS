/**
 * PERFUME-ITEM-FILE (owner 2026-11-26 22:51 CT): "IN ITEMS, I ALREADY PROVIDED YOU WITH UPCS AND TIO PERFUMES INTERNAL CODES AS
 * WELL AS HK INTERNAL CODES, WE NEED THE ITEM FILE FOR EACH ITEM ETC SO WE CAN EDIT, ETC AND THE LINKAGE SCREEN THAT SHOWS THE
 * ITEM UPC AND LINKED TO AND DESCRIPTIONS TO ALL LINKED".
 *
 * Where each code lives (read from his own files on prod, 2026-11-27):
 *   - UPC            perfume.item_upcs (one item per UPC; an item can carry several — new presentations, seasonal sets).
 *   - HK code        the item number on his HK inventory report (HK-TIO-inventory, column 2) and the first column of his offer
 *                    list — the same numbers (581 of 582 offer lines match the HK file). Remembered per item in
 *                    perfume.item_aliases under his own lists (vendors of kind inventory / offer).
 *   - TIO code       perfume.items.internal_code ("My code" on the desk; one per item). His offer list carries a second code
 *                    column (column 3); "Fill codes from my lists" copies it where it names exactly one item — he presses it.
 * Every edit is one perfume.item_events row. Moving a UPC or an HK code to another item is how a wrong link is corrected;
 * nothing is deleted. Never accounting.
 */
import type pg from "pg";
import { z } from "zod";
import { identify, looseKey, normalizeUpc } from "./normalize.js";
import { displayNameOf } from "./matching.js";
import { itemProfile } from "./profiles.service.js";
import { confirmRow, invalidateGridCache } from "./desk.service.js";
import { setItemFamily } from "./families.service.js";

export class ItemInvalid extends Error {}
export class ItemNotFound extends Error { constructor() { super("not_found"); } }

async function event(c: pg.PoolClient, itemId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.item_events (item_id, kind, detail, created_by) VALUES ($1, $2, $3::jsonb, $4)`, [itemId, kind, JSON.stringify(detail), uid]);
}
async function liveItem(c: pg.PoolClient, id: string) {
  const r = (await c.query<{ id: string; display_name: string; internal_code: string | null; brand: string; name: string; size_ml: string | null; conc: string | null;
    gender: string | null; flags: string[] | null; identity_key: string; model: string | null; product_type: string | null; category: string | null; description: string | null;
    case_pack: number | null; min_order_qty: number | null; weight_g: string | null; origin_country: string | null; hs_code: string | null }>(
    `SELECT id, display_name, internal_code, brand, name, size_ml::text, conc, gender, flags, identity_key, model, product_type, category, description,
            case_pack, min_order_qty, weight_g::text, origin_country, hs_code
       FROM perfume.items WHERE id = $1 AND merged_into_id IS NULL FOR UPDATE`, [id])).rows[0];
  if (!r) throw new ItemNotFound();
  return r;
}
const nameOf = async (c: pg.PoolClient, id: string) => (await c.query<{ display_name: string }>(`SELECT display_name FROM perfume.items WHERE id = $1`, [id])).rows[0]?.display_name ?? "another item";

/* ------------------------------------------------------------------ the item file list */

const MINE_KINDS = `('inventory', 'offer')`;
export const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  has: z.enum(["tio", "no_tio", "hk", "no_hk", "upc", "no_upc", "mine"]).optional(),
  /** Owner 23:23 CT: "SHOW ALL ITEMS OUR AND VENDORS BUT HAVE TOGGLE ONLY OUR ITEMS AND THEN ONLY VENDORS OR ALL". Ours = on my
   *  inventory / offer list in use; vendors = on a supplier's or competitor's list in use and not on mine. */
  scope: z.enum(["mine", "vendors", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
function filters(f: z.infer<typeof listQuery>, args: unknown[]) {
  const where = ["i.merged_into_id IS NULL"];
  const hk = `EXISTS (SELECT 1 FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id AND v.kind IN ${MINE_KINDS} WHERE a.item_id = i.id AND a.sku IS NOT NULL)`;
  const upc = `EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = i.id)`;
  if (f.q) {
    const q = f.q.trim();
    args.push(`%${q.toLowerCase()}%`); const like = `$${args.length}`;
    args.push(q); const exact = `$${args.length}`;
    args.push(normalizeUpc(q) || null); const u = `$${args.length}`;
    where.push(`(lower(i.display_name) LIKE ${like} OR lower(i.brand || ' ' || i.name) LIKE ${like} OR i.internal_code = ${exact}
      OR EXISTS (SELECT 1 FROM perfume.item_upcs x WHERE x.item_id = i.id AND x.upc = ${u})
      OR EXISTS (SELECT 1 FROM perfume.item_aliases a WHERE a.item_id = i.id AND a.sku = ${exact}))`);
  }
  if (f.has === "tio") where.push("i.internal_code IS NOT NULL");
  if (f.has === "no_tio") where.push("i.internal_code IS NULL");
  if (f.has === "hk") where.push(hk);
  if (f.has === "no_hk") where.push(`NOT ${hk}`);
  if (f.has === "upc") where.push(upc);
  if (f.has === "no_upc") where.push(`NOT ${upc}`);
  const onMine = `EXISTS (SELECT 1 FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = i.id AND v.kind IN ${MINE_KINDS} AND l.is_current AND l.voided_at IS NULL)`;
  const onVendor = `EXISTS (SELECT 1 FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = i.id AND v.kind NOT IN ${MINE_KINDS} AND l.is_current AND l.voided_at IS NULL)`;
  if (f.scope === "mine") where.push(onMine);
  if (f.scope === "vendors") where.push(`${onVendor} AND NOT ${onMine}`);
  if (f.has === "mine") where.push(`EXISTS (SELECT 1 FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = i.id AND v.kind IN ${MINE_KINDS} AND l.is_current AND l.voided_at IS NULL)`);
  return where.join(" AND ");
}
/** One pass per table for the page's ids (never a sub-query per item): every row read pays the FORCE RLS owner check, so the
 *  first build — one correlated sub-query per item and per KPI — took 26 s on prod (measured 2026-11-27 in the owner's browser). */
export async function listItemFile(c: pg.PoolClient, f: z.infer<typeof listQuery>) {
  const args: unknown[] = [];
  const where = filters(f, args);
  const total = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM perfume.items i WHERE ${where}`, args)).rows[0]!.n;
  args.push(f.limit, f.offset);
  const page = (await c.query<{ id: string; display_name: string; brand: string; name: string; size_ml: number | null; conc: string | null; gender: string | null;
    flags: string[] | null; tio_code: string | null; model: string | null; product_type: string | null; category: string | null; description: string | null; family_id: string | null; family: string | null;
    case_pack: number | null; min_order_qty: number | null; weight_g: number | null; origin_country: string | null; hs_code: string | null }>(
    `SELECT i.id, i.display_name, i.brand, i.name, i.size_ml::float8 AS size_ml, i.conc, i.gender, i.flags, i.internal_code AS tio_code,
            i.model, i.product_type, i.category, i.description, i.family_id,
            i.case_pack, i.min_order_qty, i.weight_g::float8 AS weight_g, i.origin_country, i.hs_code,
            (SELECT f.name FROM perfume.item_families f WHERE f.id = i.family_id) AS family
       FROM perfume.items i WHERE ${where} ORDER BY i.display_name, i.id LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  if (!page.length) return { total, rows: [] };
  const ids = page.map((r) => r.id);
  const upcs = await c.query<{ item_id: string; upcs: string[] }>(
    `SELECT item_id, array_agg(upc ORDER BY upc) AS upcs FROM perfume.item_upcs WHERE item_id = ANY($1::uuid[]) GROUP BY item_id`, [ids]);
  const hks = await c.query<{ item_id: string; codes: string[] }>(
    `SELECT a.item_id, array_agg(DISTINCT a.sku) AS codes FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id AND v.kind IN ${MINE_KINDS}
      WHERE a.item_id = ANY($1::uuid[]) AND a.sku IS NOT NULL GROUP BY a.item_id`, [ids]);
  const lines = await c.query<{ item_id: string; lists_linked: number; best: number | null; last: number | null }>(
    `SELECT r.item_id, count(DISTINCT l.vendor_id)::int AS lists_linked,
            min(r.price_cents) FILTER (WHERE v.kind = 'buy' AND r.price_cents > 0)::int AS best,
            round(avg(r.price_cents) FILTER (WHERE v.kind = 'inventory' AND r.price_cents >= 100))::int AS last
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = ANY($1::uuid[]) GROUP BY r.item_id`, [ids]);
  const avg = await c.query<{ item_id: string; avg_cost_cents: number | null }>(`SELECT item_id, avg_cost_cents FROM perfume.item_costs WHERE item_id = ANY($1::uuid[])`, [ids]);
  const U = new Map(upcs.rows.map((r) => [r.item_id, r.upcs])), H = new Map(hks.rows.map((r) => [r.item_id, r.codes]));
  const L = new Map(lines.rows.map((r) => [r.item_id, r])), A = new Map(avg.rows.map((r) => [r.item_id, r.avg_cost_cents]));
  return {
    total,
    rows: page.map((p) => ({
      ...p, upcs: U.get(p.id) ?? [], hk_codes: H.get(p.id) ?? [], lists_linked: L.get(p.id)?.lists_linked ?? 0,
      best_cost_cents: L.get(p.id)?.best ?? null, my_avg_cost_cents: A.get(p.id) ?? null, my_last_cost_cents: L.get(p.id)?.last ?? null,
    })),
  };
}
export async function itemFileCounts(c: pg.PoolClient) {
  return (await c.query(
    `WITH live AS (SELECT id, internal_code FROM perfume.items WHERE merged_into_id IS NULL),
          cur AS (SELECT r.item_id, v.kind FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL
                    JOIN perfume.vendors v ON v.id = l.vendor_id WHERE r.item_id IS NOT NULL),
          mine AS (SELECT DISTINCT item_id FROM cur WHERE kind IN ${MINE_KINDS}),
          vend AS (SELECT DISTINCT item_id FROM cur WHERE kind NOT IN ${MINE_KINDS})
     SELECT (SELECT count(*) FROM live)::int AS items,
            (SELECT count(*) FROM live WHERE internal_code IS NOT NULL)::int AS with_tio,
            (SELECT count(DISTINCT a.item_id) FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id AND v.kind IN ${MINE_KINDS}
               JOIN live ON live.id = a.item_id WHERE a.sku IS NOT NULL)::int AS with_hk,
            (SELECT count(DISTINCT u.item_id) FROM perfume.item_upcs u JOIN live ON live.id = u.item_id)::int AS with_upc,
            (SELECT count(*) FROM mine)::int AS mine,
            (SELECT count(*) FROM (SELECT item_id FROM vend EXCEPT SELECT item_id FROM mine) x)::int AS vendors_only`)).rows[0];
}

/* ------------------------------------------------------------------ one item's file */

export async function getItemFile(c: pg.PoolClient, id: string) {
  const p = await itemProfile(c, id);
  if ("merged_into_id" in p) return p;
  const hk = (await c.query(
    `SELECT a.id, a.sku, v.name AS list, a.method, a.confirmed_at FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id AND v.kind IN ${MINE_KINDS}
      WHERE a.item_id = $1 AND a.sku IS NOT NULL ORDER BY a.sku, v.name`, [id])).rows;
  const costs = (await c.query(
    `SELECT (SELECT avg_cost_cents FROM perfume.item_costs WHERE item_id = $1) AS my_avg_cost_cents,
            (SELECT round(avg(r.price_cents))::int FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
              WHERE r.item_id = $1 AND v.kind = 'inventory' AND l.is_current AND l.voided_at IS NULL AND r.price_cents >= 100) AS my_last_cost_cents`, [id])).rows[0];
  const events = (await c.query(
    `SELECT e.id, e.kind, e.detail, e.created_at, u.email AS by_email FROM perfume.item_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE e.item_id = $1 ORDER BY e.created_at, e.id`, [id])).rows;
  return { ...p, hk_codes: hk, costs, events };
}

/* ------------------------------------------------------------------ edits */

export const itemEditSchema = z.object({
  brand: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  size_ml: z.number().min(0).max(10000).nullable().optional(),
  conc: z.enum(["EDT", "EDP", "PARFUM", "EXTRAIT", "EDC", "MIST", ""]).optional(),
  gender: z.enum(["M", "W", "U", ""]).optional(),
  flags: z.array(z.enum(["TESTER", "SET", "MINI", "REFILL", "DAMAGED", "UNBOXED"])).max(6).optional(),
  tio_code: z.string().trim().max(40).nullable().optional(),
  // Owner 2026-11-27 07:22 CT — descriptive attributes, each its own field (migration 202617000100); never part of identity_key.
  model: z.string().trim().max(120).nullable().optional(),
  product_type: z.string().trim().max(60).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  // Owner 2026-11-27 08:10 CT — the item's family (one fragrance line over its sizes / testers / sets); null takes it out.
  family_id: z.string().uuid().nullable().optional(),
  // Owner 2026-11-27 12:03 CT — a tester's regular (non-tester) version, whose price the tester sells at a % of; null takes it off.
  regular_item_id: z.string().uuid().nullable().optional(),
  // Trade data (migration 202617060100): case pack, minimum order, unit weight, country of origin, HS tariff code.
  case_pack: z.number().int().min(1).max(100000).nullable().optional(),
  min_order_qty: z.number().int().min(1).max(1000000).nullable().optional(),
  weight_g: z.number().positive().max(1000000).nullable().optional(),
  origin_country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Country of origin is 2 letters (FR, US, AE …)").nullable().optional(),
  hs_code: z.string().trim().transform((v) => v.replace(/[.\s]/g, "")).pipe(z.string().regex(/^[0-9]{6,10}$/, "HS code is 6 to 10 digits")).nullable().optional(),
});
const ATTRS = ["model", "product_type", "category", "description"] as const;
const TRADE = ["case_pack", "min_order_qty", "weight_g", "origin_country", "hs_code"] as const;
/** The item's name, brand, size, type, gender and flags go through the same reading every list line goes through, so the item
 *  keeps matching vendors' lines; when another item already IS that reading, the edit is refused and names it. */
/** A tester's regular version (migration 202617070100). Only a TESTER takes one; the regular must be a live, non-tester item. One 'attributes' event. */
export async function setRegularItem(c: pg.PoolClient, uid: string, id: string, regularId: string | null) {
  const it = (await c.query<{ flags: string[] | null; regular_item_id: string | null }>(`SELECT flags, regular_item_id FROM perfume.items WHERE id = $1`, [id])).rows[0];
  if (!it) throw new ItemInvalid("That item is not on the desk.");
  if ((it.regular_item_id ?? null) === regularId) return false;
  if (regularId) {
    if (!(it.flags ?? []).includes("TESTER")) throw new ItemInvalid("Only a tester has a regular version — mark the item TESTER first.");
    if (regularId === id) throw new ItemInvalid("An item can't be its own regular version.");
    const r = (await c.query<{ flags: string[] | null; merged_into_id: string | null }>(`SELECT flags, merged_into_id FROM perfume.items WHERE id = $1`, [regularId])).rows[0];
    if (!r || r.merged_into_id) throw new ItemInvalid("The regular version must be a live item.");
    if ((r.flags ?? []).includes("TESTER")) throw new ItemInvalid("The regular version can't itself be a tester.");
  }
  await c.query(`UPDATE perfume.items SET regular_item_id = $2, updated_at = now() WHERE id = $1`, [id, regularId]);
  await event(c, id, uid, "attributes", { from: { regular_item_id: it.regular_item_id }, to: { regular_item_id: regularId } });
  return true;
}

export async function updateItemFile(c: pg.PoolClient, uid: string, id: string, x: z.infer<typeof itemEditSchema>) {
  const b = await liveItem(c, id);
  const before = { brand: b.brand, name: b.name, size_ml: b.size_ml == null ? null : Number(b.size_ml), conc: b.conc ?? "", gender: b.gender ?? "", flags: b.flags ?? [] };
  const want = { brand: x.brand ?? before.brand, name: x.name ?? before.name, size_ml: x.size_ml !== undefined ? x.size_ml : before.size_ml,
    conc: x.conc ?? before.conc, gender: x.gender ?? before.gender, flags: x.flags ?? before.flags };
  const identityChanged = JSON.stringify(want) !== JSON.stringify(before);
  if (identityChanged) {
    const id2 = identify({ description: [want.name, want.size_ml != null ? `${want.size_ml}ML` : "", want.conc, want.flags.join(" ")].filter(Boolean).join(" "),
      brand: want.brand, gender: want.gender === "M" ? "Men" : want.gender === "W" ? "Women" : want.gender === "U" ? "Unisex" : null });
    if (!id2.nameWords.length && !id2.brand) throw new ItemInvalid("The item needs a name.");
    const other = (await c.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM perfume.items WHERE identity_key = $1 AND merged_into_id IS NULL AND id <> $2 LIMIT 1`, [id2.key, id])).rows[0];
    if (other) throw new ItemInvalid(`That is already the item "${other.display_name}". Move this item's UPCs / codes to it instead.`);
    await c.query(
      `UPDATE perfume.items SET brand = $2, name = $3, size_ml = $4, conc = $5, gender = $6, flags = $7, identity_key = $8, loose_key = $9, display_name = $10, updated_at = now()
        WHERE id = $1`,
      [id, id2.brand || want.brand, id2.nameText || want.name, id2.sizeMl, id2.conc, id2.gender, id2.flags, id2.key, looseKey(id2), displayNameOf(id2)]);
    await event(c, id, uid, "edited", { from: { ...before, display_name: b.display_name }, to: { ...want, display_name: displayNameOf(id2) } });
  }
  // Descriptive attributes: written as typed (blank = cleared), one event with every field that changed.
  const attrFrom: Record<string, string | null> = {}, attrTo: Record<string, string | null> = {};
  for (const k of ATTRS) {
    if (x[k] === undefined) continue;
    const v = x[k]?.trim() || null;
    const was = b[k];
    if ((was ?? null) !== v) { attrFrom[k] = was ?? null; attrTo[k] = v; }
  }
  if (Object.keys(attrTo).length) {
    const keys = Object.keys(attrTo);
    await c.query(`UPDATE perfume.items SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => attrTo[k])]);
    await event(c, id, uid, "attributes", { from: attrFrom, to: attrTo });
  }
  // Trade data: written as given (null clears), one 'attributes' event with what changed.
  const tFrom: Record<string, unknown> = {}, tTo: Record<string, unknown> = {};
  for (const k of TRADE) {
    if (x[k] === undefined) continue;
    const v = x[k] === "" ? null : x[k];
    const was = b[k] == null ? null : (k === "weight_g" ? Number(b[k]) : b[k]);
    if (was !== (v ?? null)) { tFrom[k] = was; tTo[k] = v ?? null; }
  }
  if (Object.keys(tTo).length) {
    const keys = Object.keys(tTo);
    await c.query(`UPDATE perfume.items SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => tTo[k])]);
    await event(c, id, uid, "attributes", { from: tFrom, to: tTo });
  }
  if (x.family_id !== undefined) await setItemFamily(c, uid, id, x.family_id, b.display_name);
  if (x.regular_item_id !== undefined) await setRegularItem(c, uid, id, x.regular_item_id);
  if (x.tio_code !== undefined) {
    const code = x.tio_code?.trim() || null;
    if (code !== b.internal_code) {
      if (code) {
        const used = (await c.query<{ id: string; display_name: string }>(
          `SELECT id, display_name FROM perfume.items WHERE internal_code = $1 AND merged_into_id IS NULL AND id <> $2`, [code, id])).rows[0];
        if (used) throw new ItemInvalid(`TIO code ${code} is already on "${used.display_name}".`);
      }
      await c.query(`UPDATE perfume.items SET internal_code = $2, updated_at = now() WHERE id = $1`, [id, code]);
      await event(c, id, uid, "tio_code", { from: b.internal_code, to: code });
    }
  }
  return { ok: true };
}

/**
 * Item creator (owner 2026-11-27 07:37 CT "in the item creator it should have those rows and should be able to select from list for
 * each one"). Same identity rules as the desk: the name is read the same way, and an item that is already in the file is refused with
 * its name (open it instead). TIO code and UPC are optional and checked like the editor does. History: one 'created' row.
 */
export const itemCreateSchema = z.object({
  brand: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  size_ml: z.number().min(0).max(10000).nullable().optional(),
  conc: z.enum(["EDT", "EDP", "PARFUM", "EXTRAIT", "EDC", "MIST", ""]).optional(),
  gender: z.enum(["M", "W", "U", ""]).optional(),
  flags: z.array(z.enum(["TESTER", "SET", "MINI", "REFILL", "DAMAGED", "UNBOXED"])).max(6).optional(),
  model: z.string().trim().max(120).nullable().optional(),
  product_type: z.string().trim().max(60).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tio_code: z.string().trim().max(40).nullable().optional(),
  upc: z.string().trim().max(40).nullable().optional(),
  family_id: z.string().uuid().nullable().optional(),
  // Trade data (migration 202617060100): case pack, minimum order, unit weight, country of origin, HS tariff code.
  case_pack: z.number().int().min(1).max(100000).nullable().optional(),
  min_order_qty: z.number().int().min(1).max(1000000).nullable().optional(),
  weight_g: z.number().positive().max(1000000).nullable().optional(),
  origin_country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Country of origin is 2 letters (FR, US, AE …)").nullable().optional(),
  hs_code: z.string().trim().transform((v) => v.replace(/[.\s]/g, "")).pipe(z.string().regex(/^[0-9]{6,10}$/, "HS code is 6 to 10 digits")).nullable().optional(),
});
export async function createItem(c: pg.PoolClient, uid: string, x: z.infer<typeof itemCreateSchema>) {
  const flags = x.flags ?? [];
  const id2 = identify({ description: [x.name, x.size_ml != null ? `${x.size_ml}ML` : "", x.conc ?? "", flags.join(" ")].filter(Boolean).join(" "),
    brand: x.brand, gender: x.gender === "M" ? "Men" : x.gender === "W" ? "Women" : x.gender === "U" ? "Unisex" : null });
  if (!id2.nameWords.length && !id2.brand) throw new ItemInvalid("The item needs a name.");
  const same = (await c.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM perfume.items WHERE identity_key = $1 AND merged_into_id IS NULL LIMIT 1`, [id2.key])).rows[0];
  if (same) throw new ItemInvalid(`That item is already in the file: "${same.display_name}". Open it instead.`);
  const code = x.tio_code?.trim() || null;
  if (code) {
    const used = (await c.query<{ display_name: string }>(`SELECT display_name FROM perfume.items WHERE internal_code = $1 AND merged_into_id IS NULL`, [code])).rows[0];
    if (used) throw new ItemInvalid(`TIO code ${code} is already on "${used.display_name}".`);
  }
  const upc = x.upc?.trim() ? normalizeUpc(x.upc) : null;
  if (x.upc?.trim() && !upc) throw new ItemInvalid("That is not a UPC (8 to 14 digits).");
  if (upc) {
    const had = (await c.query<{ display_name: string }>(
      `SELECT i.display_name FROM perfume.item_upcs u JOIN perfume.items i ON i.id = u.item_id WHERE u.upc = $1`, [upc])).rows[0];
    if (had) throw new ItemInvalid(`UPC ${upc} is already on "${had.display_name}" — open that item instead.`);
  }
  const attr = (v: string | null | undefined) => v?.trim() || null;
  const ins = await c.query<{ id: string }>(
    `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name, internal_code, model, product_type, category, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [id2.brand || x.brand, id2.nameText || x.name, id2.sizeMl, id2.conc, id2.gender, id2.flags, id2.key, looseKey(id2), displayNameOf(id2), code,
     attr(x.model), attr(x.product_type), attr(x.category), attr(x.description), uid]);
  const id = ins.rows[0]!.id;
  if (upc) await c.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ($1, $2)`, [upc, id]);
  await event(c, id, uid, "created", { ...x, flags, upc });
  if (x.family_id) await setItemFamily(c, uid, id, x.family_id, displayNameOf(id2));
  const trade = TRADE.filter((k) => x[k] != null);
  if (trade.length) await c.query(`UPDATE perfume.items SET ${trade.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [id, ...trade.map((k) => x[k])]);
  invalidateGridCache();
  return { id, display_name: displayNameOf(id2) };
}

/** The choices the creator offers: brands, models and sizes already in the file (most used first). */
export async function itemOptions(c: pg.PoolClient) {
  const col = async (sql: string) => (await c.query<{ v: string }>(sql)).rows.map((r) => r.v);
  return {
    brands: await col(`SELECT brand AS v FROM perfume.items WHERE merged_into_id IS NULL AND btrim(brand) <> '' GROUP BY brand ORDER BY count(*) DESC, brand LIMIT 3000`),
    models: await col(`SELECT model AS v FROM perfume.items WHERE merged_into_id IS NULL AND model IS NOT NULL GROUP BY model ORDER BY count(*) DESC, model LIMIT 3000`),
    sizes: await col(`SELECT (size_ml::float8)::text AS v FROM perfume.items WHERE merged_into_id IS NULL AND size_ml IS NOT NULL GROUP BY size_ml ORDER BY count(*) DESC LIMIT 40`),
  };
}

/**
 * Bulk edit (owner 2026-11-27 07:22 CT "multiple selector … to edit in mass and bulk"): the same edit applied to every selected item
 * through updateItemFile, so each item gets its own history event and the same identity checks. All or nothing: if one item cannot
 * take the change (e.g. it would become a copy of another item), nothing is saved and the answer names that item. Flags are added
 * or removed, never replaced wholesale.
 */
export const itemBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  set: itemEditSchema.omit({ name: true, tio_code: true, flags: true }),
  flags_add: z.array(z.enum(["TESTER", "SET", "MINI", "REFILL", "DAMAGED", "UNBOXED"])).max(6).optional(),
  flags_remove: z.array(z.enum(["TESTER", "SET", "MINI", "REFILL", "DAMAGED", "UNBOXED"])).max(6).optional(),
});
export async function bulkEditItems(c: pg.PoolClient, uid: string, x: z.infer<typeof itemBulkSchema>) {
  const ids = [...new Set(x.ids)];
  const hasSet = Object.values(x.set).some((v) => v !== undefined);
  if (!hasSet && !x.flags_add?.length && !x.flags_remove?.length) throw new ItemInvalid("Choose at least one field to change.");
  await c.query("SAVEPOINT bulk_items");
  try {
    for (const id of ids) {
      const it = await liveItem(c, id);
      let flags: string[] | undefined;
      if (x.flags_add?.length || x.flags_remove?.length) {
        const cur = new Set<string>(it.flags ?? []);
        for (const f of x.flags_add ?? []) cur.add(f);
        for (const f of x.flags_remove ?? []) cur.delete(f);
        flags = [...cur];
      }
      try {
        await updateItemFile(c, uid, id, { ...x.set, ...(flags ? { flags: flags as z.infer<typeof itemEditSchema>["flags"] } : {}) });
      } catch (e) {
        if (e instanceof ItemInvalid) throw new ItemInvalid(`"${it.display_name}": ${e.message} Nothing was saved.`);
        throw e;
      }
    }
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT bulk_items");
    throw e;
  }
  await c.query("RELEASE SAVEPOINT bulk_items");
  return { updated: ids.length };
}

/** A UPC onto this item: new, or moved from the item that had it (both items' files say so). */
export async function addUpc(c: pg.PoolClient, uid: string, id: string, raw: string) {
  await liveItem(c, id);
  const upc = normalizeUpc(raw);
  if (!upc) throw new ItemInvalid("That is not a UPC (8 to 14 digits).");
  const had = (await c.query<{ item_id: string }>(`SELECT item_id FROM perfume.item_upcs WHERE upc = $1 FOR UPDATE`, [upc])).rows[0];
  if (had?.item_id === id) return { upc, moved_from: null };
  if (had) {
    await c.query(`UPDATE perfume.item_upcs SET item_id = $2 WHERE upc = $1`, [upc, id]);
    await event(c, had.item_id, uid, "upc_moved_out", { upc, to_item_id: id, to: await nameOf(c, id) });
    await event(c, id, uid, "upc_moved_in", { upc, from_item_id: had.item_id, from: await nameOf(c, had.item_id) });
  } else {
    await c.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ($1, $2)`, [upc, id]);
    await event(c, id, uid, "upc_added", { upc });
  }
  // Lines carrying this UPC on current lists follow it (the owner's word is the authority on what a barcode is).
  const lines = await c.query(
    `UPDATE perfume.price_list_rows r SET item_id = $2, match_method = 'confirmed', match_status = 'matched', suggestions = '[]'::jsonb
       FROM perfume.price_lists l WHERE l.id = r.list_id AND l.is_current AND l.voided_at IS NULL AND ltrim(r.upc, '0') = $1 AND r.item_id IS DISTINCT FROM $2`, [upc, id]);
  return { upc, moved_from: had?.item_id ?? null, lines_relinked: lines.rowCount ?? 0 };
}

/** An HK code onto this item (his inventory list's item number): new, or moved from the item that had it. */
export async function addHkCode(c: pg.PoolClient, uid: string, id: string, raw: string) {
  await liveItem(c, id);
  const sku = raw.trim();
  if (!/^[A-Za-z0-9-]{1,40}$/.test(sku)) throw new ItemInvalid("Type the HK code (letters / digits).");
  const inv = (await c.query<{ id: string }>(`SELECT id FROM perfume.vendors WHERE kind = 'inventory' AND archived_at IS NULL ORDER BY created_at LIMIT 1`)).rows[0];
  if (!inv) throw new ItemInvalid("Upload your inventory list first — HK codes are filed under it.");
  const had = (await c.query<{ item_id: string }>(
    `SELECT a.item_id FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id AND v.kind IN ${MINE_KINDS} WHERE a.sku = $1 AND a.item_id <> $2 LIMIT 1`, [sku, id])).rows[0];
  const moved = await c.query(
    `UPDATE perfume.item_aliases a SET item_id = $2, method = 'confirmed', confirmed_by = $3, confirmed_at = now() FROM perfume.vendors v
      WHERE v.id = a.vendor_id AND v.kind IN ${MINE_KINDS} AND a.sku = $1`, [sku, id, uid]);
  if (!moved.rowCount) {
    await c.query(`INSERT INTO perfume.item_aliases (item_id, vendor_id, sku, method, confirmed_by, confirmed_at) VALUES ($1, $2, $3, 'confirmed', $4, now())`, [id, inv.id, sku, uid]);
  }
  if (had) {
    await event(c, had.item_id, uid, "hk_code_moved_out", { hk_code: sku, to_item_id: id, to: await nameOf(c, id) });
    await event(c, id, uid, "hk_code_moved_in", { hk_code: sku, from_item_id: had.item_id, from: await nameOf(c, had.item_id) });
  } else await event(c, id, uid, "hk_code_added", { hk_code: sku });
  const lines = await c.query(
    `UPDATE perfume.price_list_rows r SET item_id = $2, match_method = 'confirmed', match_status = 'matched', suggestions = '[]'::jsonb
       FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE l.id = r.list_id AND v.kind IN ${MINE_KINDS} AND l.is_current AND l.voided_at IS NULL AND r.sku = $1 AND r.item_id IS DISTINCT FROM $2`, [sku, id]);
  return { hk_code: sku, moved_from: had?.item_id ?? null, lines_relinked: lines.rowCount ?? 0 };
}

/* ------------------------------------------------------------------ fill codes from his own lists (he presses it) */

const OFFER_TIO = `SELECT r.item_id, btrim(r.raw->>'2') AS code
    FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
   WHERE v.kind = 'offer' AND l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL AND btrim(coalesce(r.raw->>'2', '')) ~ '^[0-9A-Za-z-]{1,40}$'`;
/** What "Fill codes from my lists" would do: each TIO code on his current offer list that names exactly one item, on an item that
 *  has none, and is on no other item. */
export async function fillCodesPreview(c: pg.PoolClient) {
  const r = (await c.query<{ code: string; item_id: string; display_name: string }>(
    `WITH o AS (${OFFER_TIO}), one AS (SELECT code, min(item_id::text)::uuid AS item_id FROM o GROUP BY code HAVING count(DISTINCT item_id) = 1),
          per_item AS (SELECT item_id FROM one GROUP BY item_id HAVING count(*) = 1)
     SELECT one.code, one.item_id, i.display_name FROM one JOIN per_item USING (item_id) JOIN perfume.items i ON i.id = one.item_id
      WHERE i.internal_code IS NULL AND i.merged_into_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM perfume.items x WHERE x.internal_code = one.code AND x.merged_into_id IS NULL)
      ORDER BY i.display_name`)).rows;
  const all = (await c.query<{ n: number }>(`SELECT count(DISTINCT code)::int AS n FROM (${OFFER_TIO}) o`)).rows[0]!.n;
  return { codes_on_list: all, will_fill: r.length, sample: r.slice(0, 50) };
}
export async function fillCodesApply(c: pg.PoolClient, uid: string) {
  const p = await fillCodesPreview(c);
  const r = await c.query<{ id: string; internal_code: string }>(
    `WITH o AS (${OFFER_TIO}), one AS (SELECT code, min(item_id::text)::uuid AS item_id FROM o GROUP BY code HAVING count(DISTINCT item_id) = 1),
          per_item AS (SELECT item_id FROM one GROUP BY item_id HAVING count(*) = 1)
     UPDATE perfume.items i SET internal_code = one.code, updated_at = now() FROM one JOIN per_item USING (item_id)
      WHERE i.id = one.item_id AND i.internal_code IS NULL AND i.merged_into_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM perfume.items x WHERE x.internal_code = one.code AND x.merged_into_id IS NULL)
     RETURNING i.id, i.internal_code`);
  if (r.rowCount) {
    await c.query(
      `INSERT INTO perfume.item_events (item_id, kind, detail, created_by)
       SELECT x.id, 'codes_filled', jsonb_build_object('tio_code', x.code, 'from', 'my offer list'), $2 FROM unnest($1::uuid[], $3::text[]) AS x(id, code)`,
      [r.rows.map((x) => x.id), uid, r.rows.map((x) => x.internal_code)]);
  }
  return { filled: r.rowCount ?? 0, previewed: p.will_fill };
}

/* ------------------------------------------------------------------ the linkage screen */

export const linkageQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
/** Every line on a current list that carries this UPC / code / words, and every line linked to the item(s) they point to: the
 *  vendor, their code, their UPC, their description, their price, what it is linked to and how. */
export async function linkage(c: pg.PoolClient, f: z.infer<typeof linkageQuery>) {
  const q = f.q.trim();
  const upc = normalizeUpc(q) || null;
  const items = (await c.query<{ id: string }>(
    `SELECT DISTINCT i.id FROM perfume.items i WHERE i.merged_into_id IS NULL AND (
        i.internal_code = $1
        OR ($2::text IS NOT NULL AND EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = i.id AND u.upc = $2))
        OR EXISTS (SELECT 1 FROM perfume.item_aliases a WHERE a.item_id = i.id AND a.sku = $1)) LIMIT 50`, [q, upc])).rows.map((r) => r.id);
  const rows = (await c.query(
    `SELECT r.id AS line_id, v.id AS vendor_id, v.name AS vendor, v.kind, r.sku, r.upc, r.brand, r.description, r.size_text, r.price_cents::int AS price_cents,
            r.match_status, r.match_method, l.list_date::text, r.item_id, i.display_name AS item, i.internal_code AS tio_code,
            CASE WHEN ltrim(r.upc, '0') = $2 THEN 'upc' WHEN r.sku = $1 THEN 'code' WHEN r.item_id = ANY($3::uuid[]) THEN 'item' ELSE 'words' END AS found_by
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
       LEFT JOIN perfume.items i ON i.id = r.item_id
      WHERE l.is_current AND l.voided_at IS NULL
        AND (r.item_id = ANY($3::uuid[]) OR ($2::text IS NOT NULL AND ltrim(r.upc, '0') = $2) OR r.sku = $1
             OR (length($1) >= 4 AND $2::text IS NULL AND lower(concat_ws(' ', r.brand, r.description, r.size_text)) LIKE $4))
      ORDER BY i.display_name NULLS LAST, (v.kind = 'sell'), r.price_cents NULLS LAST, v.name LIMIT $5`,
    [q, upc, items, `%${q.toLowerCase()}%`, f.limit])).rows;
  const itemRows = items.length ? (await c.query(
    `SELECT i.id, i.display_name, i.internal_code AS tio_code, coalesce((SELECT array_agg(u.upc ORDER BY u.upc) FROM perfume.item_upcs u WHERE u.item_id = i.id), '{}') AS upcs
       FROM perfume.items i WHERE i.id = ANY($1::uuid[]) ORDER BY i.display_name`, [items])).rows : [];
  return { q, upc, items: itemRows, lines: rows };
}


/* ------------------------------------------------------------------ stock linkage (owner 2026-11-27 06:19 CT) */
/*
 * "I THINK YOU NEED TO CONFIRM ALL THOSE PERFUMES CORRECTLY TO UPCS AND VENDORS". Measured on prod 2026-11-27: of 3,877 items on his
 * own lists only 989 are linked to any vendor line — his HK inventory names ("JPG LE MALE EDT 200ML (M)", "TF NOIR EXTREME") were
 * read as items of their own. Linking one of OUR items to the vendors' item moves every line of his lists (and their remembered HK
 * codes / words, so the next import links by itself), its UPCs, TIO code and my avg cost onto that item, and retires ours as merged.
 * A candidate must be the same bottle: same size, same kind (tester / set / mini / body / refill …), gender and concentration not
 * contradicting, brand the same or unread. Nothing links unless he (or the strict rule below, which he sees first) says so.
 */
const KIND_SQL = (a: string) => `ARRAY(SELECT f FROM unnest(coalesce(${a}.flags, '{}')) f WHERE f IN ('SET','TESTER','MINI','BODY','OIL','VARIOUS','REFILL') ORDER BY f)`;
const STOP = `('EDP','EDT','EDC','PARFUM','EXTRAIT','SPRAY','SP','SPR','FOR','POUR','HOMME','FEMME','MEN','WOMEN','MAN','WOMAN','HER','HIM','THE','DE','DI','LE','LA','L','W','M','U','OZ','ML','EAU','TESTER','NEW')`;
const TOKENS = (a: string) => `(SELECT string_agg(t, ' ' ORDER BY t) FROM (SELECT DISTINCT t FROM regexp_split_to_table(regexp_replace(upper(${a}.name), '[^A-Z0-9]+', ' ', 'g'), ' ') t
    WHERE t <> '' AND t NOT IN ${STOP}) x)`;
/** Our items (on my current inventory / offer list) that no supplier or competitor line is linked to. */
const UNLINKED_MINE = `
  WITH cur AS (SELECT r.item_id, v.kind FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL
                 JOIN perfume.vendors v ON v.id = l.vendor_id WHERE r.item_id IS NOT NULL),
       mine AS (SELECT DISTINCT item_id FROM cur WHERE kind IN ${MINE_KINDS}),
       vend AS (SELECT DISTINCT item_id FROM cur WHERE kind NOT IN ${MINE_KINDS})`;
/** The same-bottle rule between our item m and a vendors' item v. */
const SAME_BOTTLE = `v.size_ml IS NOT DISTINCT FROM m.size_ml AND ${KIND_SQL("m")} = ${KIND_SQL("v")}
    AND (coalesce(m.gender, '') = coalesce(v.gender, '') OR coalesce(m.gender, '') = '' OR coalesce(v.gender, '') = '')
    AND (coalesce(m.conc, '') = coalesce(v.conc, '') OR coalesce(m.conc, '') = '' OR coalesce(v.conc, '') = '')
    AND (m.brand = v.brand OR coalesce(m.brand, '') = '' OR coalesce(v.brand, '') = '')`;

/** Item categories that are their own line of goods, not perfume (owner 2026-11-27 07:50 CT). */
export const NOT_PERFUME_CATEGORIES = ["Skincare", "Cosmetics", "Hair care"] as const;
const NOT_PERFUME = `(${NOT_PERFUME_CATEGORIES.map((x) => `'${x}'`).join(", ")})`;
export const stockQueueQuery = z.object({
  q: z.string().trim().max(200).optional(),
  perfumes_only: z.preprocess((v) => (v === "false" || v === false ? false : v === undefined ? undefined : true), z.boolean().default(true)),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export async function stockLinkQueue(c: pg.PoolClient, f: z.infer<typeof stockQueueQuery>) {
  const args: unknown[] = [];
  const where = ["i.id IN (SELECT item_id FROM mine)", "i.id NOT IN (SELECT item_id FROM vend)", "i.merged_into_id IS NULL"];
  // Owner 2026-11-27 07:50 CT: "Skincare and cosmetics are their own category" — they are not perfumes waiting for a vendor match.
  if (f.perfumes_only) where.push(`i.size_ml IS NOT NULL AND NOT ('VARIOUS' = ANY(coalesce(i.flags, '{}'))) AND coalesce(i.category, '') NOT IN ${NOT_PERFUME}`);
  if (f.q) { args.push(`%${f.q.toLowerCase()}%`); where.push(`lower(i.display_name) LIKE $${args.length}`); }
  const total = (await c.query<{ n: number }>(`${UNLINKED_MINE} SELECT count(*)::int AS n FROM perfume.items i WHERE ${where.join(" AND ")}`, args)).rows[0]!.n;
  const linked = (await c.query<{ mine: number; linked: number }>(`${UNLINKED_MINE}
    SELECT (SELECT count(*) FROM mine)::int AS mine, (SELECT count(*) FROM mine WHERE item_id IN (SELECT item_id FROM vend))::int AS linked`)).rows[0]!;
  args.push(f.limit, f.offset);
  const page = (await c.query<{ id: string; display_name: string; upcs: string[] | null; hk: string | null; my_desc: string | null }>(`${UNLINKED_MINE}
    SELECT i.id, i.display_name, (SELECT array_agg(u.upc) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs,
           (SELECT min(r.sku) FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL JOIN perfume.vendors v ON v.id = l.vendor_id
             WHERE r.item_id = i.id AND v.kind IN ${MINE_KINDS}) AS hk,
           (SELECT min(r.description) FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL JOIN perfume.vendors v ON v.id = l.vendor_id
             WHERE r.item_id = i.id AND v.kind IN ${MINE_KINDS}) AS my_desc
      FROM perfume.items i WHERE ${where.join(" AND ")} ORDER BY i.display_name, i.id LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  const ids = page.map((p) => p.id);
  const cands = ids.length ? (await c.query<{ mine_id: string; id: string; display_name: string; score: number; same_brand: boolean; lists: number; best_cents: number | null;
    upcs: string[] | null; sample: string | null; exact: boolean }>(`${UNLINKED_MINE},
      v AS (SELECT i.* FROM perfume.items i WHERE i.id IN (SELECT item_id FROM vend) AND i.merged_into_id IS NULL),
      c AS (SELECT m.id AS mine_id, v.id, v.display_name, similarity(m.name, v.name)::float8 AS score, (m.brand = v.brand AND m.brand <> '') AS same_brand,
                   ${TOKENS("m")} = ${TOKENS("v")} AS exact,
                   row_number() OVER (PARTITION BY m.id ORDER BY (${TOKENS("m")} = ${TOKENS("v")}) DESC, (m.brand = v.brand AND m.brand <> '') DESC, similarity(m.name, v.name) DESC) AS rk
              FROM perfume.items m JOIN v ON ${SAME_BOTTLE} AND (similarity(m.name, v.name) >= 0.25 OR ${TOKENS("m")} = ${TOKENS("v")})
             WHERE m.id = ANY($1::uuid[]))
    SELECT c.mine_id, c.id, c.display_name, round(c.score::numeric, 2)::float8 AS score, c.same_brand, c.exact,
           (SELECT count(DISTINCT l.vendor_id)::int FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL WHERE r.item_id = c.id) AS lists,
           (SELECT min(r.price_cents)::int FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL JOIN perfume.vendors vv ON vv.id = l.vendor_id
             WHERE r.item_id = c.id AND vv.kind = 'buy' AND r.price_cents > 0) AS best_cents,
           (SELECT array_agg(u.upc) FROM perfume.item_upcs u WHERE u.item_id = c.id) AS upcs,
           (SELECT min(r.description) FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id AND l.is_current AND l.voided_at IS NULL WHERE r.item_id = c.id) AS sample
      FROM c WHERE c.rk <= 5 ORDER BY c.mine_id, c.rk`, [ids])).rows : [];
  const by = new Map<string, typeof cands>();
  for (const x of cands) { const a = by.get(x.mine_id) ?? []; a.push(x); by.set(x.mine_id, a); }
  return { total, mine: linked.mine, linked: linked.linked, rows: page.map((p) => ({ ...p, candidates: by.get(p.id) ?? [] })) };
}

/** Link OUR item to the vendors' item: every line of it moves (remembered by HK code and words for the next import), its UPCs,
 *  TIO code, my avg cost and HK codes follow, and ours is retired as merged into it. Both items' files record it. */
/** Two sizes that are one bottle written two ways — oz rounded to ml (4 oz = 118 vs 120 ml; 84 vs 85 ml): within 2.5 %. */
export const SAME_BOTTLE_SIZE_SHARE = 0.025;
export function sizesAreSameBottle(a: number, b: number) {
  return Math.abs(a - b) <= SAME_BOTTLE_SIZE_SHARE * Math.max(a, b);
}

export async function linkItemTo(c: pg.PoolClient, uid: string, fromId: string, toId: string, opts: { sameBottleSizes?: boolean } = {}) {
  if (fromId === toId) throw new ItemInvalid("That is the same item.");
  const from = await liveItem(c, fromId);
  const to = await liveItem(c, toId);
  const kind = (f: string[] | null) => (f ?? []).filter((x) => ["SET", "TESTER", "MINI", "BODY", "OIL", "VARIOUS", "REFILL"].includes(x)).sort().join("+");
  const fromSize = from.size_ml == null ? null : Number(from.size_ml);
  const toSize = to.size_ml == null ? null : Number(to.size_ml);
  // Owner 2026-11-27 12:05 CT ("continue working on the rest"): a size written two ways (118 vs 120 ml) is one bottle only when the
  // owner says so on this link (same_bottle_sizes) and the two are within 2.5 %; anything else stays refused.
  const roundedSize = fromSize != null && toSize != null && fromSize !== toSize;
  if (roundedSize && !(opts.sameBottleSizes && sizesAreSameBottle(fromSize, toSize))) {
    throw new ItemInvalid(sizesAreSameBottle(fromSize, toSize)
      ? `Different sizes: ${fromSize} ml vs ${toSize} ml. If this is the same bottle written two ways, link it with "same bottle sizes".`
      : `Different sizes: ${fromSize} ml vs ${toSize} ml.`);
  }
  // Between two gift sets BODY / MINI / VARIOUS only say what is inside the box, and each vendor's wording raises them differently
  // ("SG" vs "shower gel"): the contents are what the owner checks when he links a set, so sets compare on SET / TESTER / REFILL.
  const bothSets = kind(from.flags).split("+").includes("SET") && kind(to.flags).split("+").includes("SET");
  const boxKind = (f: string[] | null) => (f ?? []).filter((x) => ["SET", "TESTER", "REFILL"].includes(x)).sort().join("+");
  if (bothSets ? boxKind(from.flags) !== boxKind(to.flags) : kind(from.flags) !== kind(to.flags)) {
    throw new ItemInvalid(`Different kind of product: ${kind(from.flags) || "regular"} vs ${kind(to.flags) || "regular"}.`);
  }
  const rows = (await c.query<{ id: string }>(`SELECT id FROM perfume.price_list_rows WHERE item_id = $1`, [fromId])).rows;
  for (const r of rows) await confirmRow(c as never, uid, r.id, { item_id: toId });
  await c.query(`UPDATE perfume.item_upcs SET item_id = $2 WHERE item_id = $1`, [fromId, toId]);
  await c.query(`UPDATE perfume.item_aliases SET item_id = $2 WHERE item_id = $1`, [fromId, toId]);
  if (from.internal_code && !to.internal_code) {
    await c.query(`UPDATE perfume.items SET internal_code = NULL WHERE id = $1`, [fromId]);
    await c.query(`UPDATE perfume.items SET internal_code = $2, updated_at = now() WHERE id = $1`, [toId, from.internal_code]);
  }
  await c.query(
    `INSERT INTO perfume.item_costs (item_id, avg_cost_cents, updated_by, updated_at)
     SELECT $2, avg_cost_cents, $3, now() FROM perfume.item_costs WHERE item_id = $1 AND avg_cost_cents IS NOT NULL ON CONFLICT (item_id) DO NOTHING`, [fromId, toId, uid]);
  await c.query(`UPDATE perfume.items SET merged_into_id = $2, updated_at = now() WHERE id = $1`, [fromId, toId]);
  const sizes = roundedSize ? { same_bottle_sizes: { from_ml: fromSize, to_ml: toSize } } : {};
  await event(c, fromId, uid, "line_linked", { merged_into_item_id: toId, into: to.display_name, lines: rows.length, ...sizes });
  await event(c, toId, uid, "line_linked", { merged_from_item_id: fromId, from: from.display_name, lines: rows.length, tio_code: from.internal_code, ...sizes });
  invalidateGridCache();
  return { lines: rows.length, into: to.display_name };
}

/** The strict rule, shown before anything links: same words (ignoring EDP / EDT / for him / pour homme …), same brand, same size,
 *  same kind, gender and concentration not contradicting — exactly one vendors' item fits, and no other of our items fits it
 *  (Armani Code Men and Code Women must not both land on one unsexed tester). */
export async function strictLinkPreview(c: pg.PoolClient) {
  return (await c.query<{ mine_id: string; mine: string; vend_id: string; vend: string }>(`${UNLINKED_MINE},
      -- Each item's words are worked out once, then items meet only on equal words + brand (measured 11-27: computing the words
      -- per candidate pair ran past a minute on prod; this form 658 ms).
      v AS MATERIALIZED (SELECT i.*, ${TOKENS("i")} AS k FROM perfume.items i WHERE i.id IN (SELECT item_id FROM vend) AND i.merged_into_id IS NULL AND i.brand <> ''),
      m AS MATERIALIZED (SELECT i.*, ${TOKENS("i")} AS k FROM perfume.items i WHERE i.id IN (SELECT item_id FROM mine) AND i.id NOT IN (SELECT item_id FROM vend)
                           AND i.merged_into_id IS NULL AND i.brand <> '' AND i.size_ml IS NOT NULL),
      p AS MATERIALIZED (SELECT m.id AS mine_id, m.display_name AS mine, v.id AS vend_id, v.display_name AS vend
              FROM m JOIN v ON v.k = m.k AND v.brand = m.brand AND m.k IS NOT NULL AND ${SAME_BOTTLE})
    SELECT * FROM p WHERE mine_id IN (SELECT mine_id FROM p GROUP BY mine_id HAVING count(*) = 1)
                      AND vend_id IN (SELECT vend_id FROM p GROUP BY vend_id HAVING count(*) = 1) ORDER BY mine`)).rows;
}
export async function strictLinkApply(c: pg.PoolClient, uid: string) {
  const pairs = await strictLinkPreview(c);
  let linked = 0;
  for (const p of pairs) { await linkItemTo(c, uid, p.mine_id, p.vend_id); linked++; }
  return { linked };
}
