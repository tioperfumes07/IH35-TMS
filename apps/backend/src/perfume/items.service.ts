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

export class ItemInvalid extends Error {}
export class ItemNotFound extends Error { constructor() { super("not_found"); } }

async function event(c: pg.PoolClient, itemId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.item_events (item_id, kind, detail, created_by) VALUES ($1, $2, $3::jsonb, $4)`, [itemId, kind, JSON.stringify(detail), uid]);
}
async function liveItem(c: pg.PoolClient, id: string) {
  const r = (await c.query<{ id: string; display_name: string; internal_code: string | null; brand: string; name: string; size_ml: string | null; conc: string | null;
    gender: string | null; flags: string[] | null; identity_key: string }>(
    `SELECT id, display_name, internal_code, brand, name, size_ml::text, conc, gender, flags, identity_key FROM perfume.items WHERE id = $1 AND merged_into_id IS NULL FOR UPDATE`, [id])).rows[0];
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
    flags: string[] | null; tio_code: string | null }>(
    `SELECT i.id, i.display_name, i.brand, i.name, i.size_ml::float8 AS size_ml, i.conc, i.gender, i.flags, i.internal_code AS tio_code
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
});
/** The item's name, brand, size, type, gender and flags go through the same reading every list line goes through, so the item
 *  keeps matching vendors' lines; when another item already IS that reading, the edit is refused and names it. */
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
