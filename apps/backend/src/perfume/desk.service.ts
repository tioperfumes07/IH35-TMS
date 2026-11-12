/**
 * PERFUME-DESK service — the only writer of perfume.*. Owner-only (RLS + route guard). Never touches a
 * carrier table and never posts to the GL. Every amount is integer cents.
 */
import type { PoolClient } from "pg";
import ExcelJS from "exceljs";
import { addItem, displayNameOf, emptyIndex, matchLine, type LineIn, type MatchIndex } from "./matching.js";
import { BUILTIN_BRAND_ALIASES, categoryOf, identify, looseKey, normalizeUpc, vendorLineTail, type Identity } from "./normalize.js";
import { closeCents, costFromPrice, marginPct, markupPct, priceFromCost, rankOffers, type RoundDir, type RoundStep } from "./pricing.js";

/* ---------------- rules ---------------- */

export type DeskRules = {
  round_step: RoundStep;
  round_dir: RoundDir;
  cushion_lo_cents: number;
  cushion_hi_cents: number;
  freight_lo_cents: number;
  freight_hi_cents: number;
  vendor_earn_pct: number;
  store_earn_pct: number;
  wholesale_targets_pct: number[];
  columns?: Record<string, string[]>;
};
export const DEFAULT_RULES: DeskRules = {
  round_step: "50", round_dir: "up", cushion_lo_cents: 25, cushion_hi_cents: 50, freight_lo_cents: 35, freight_hi_cents: 45,
  vendor_earn_pct: 16, store_earn_pct: 16, wholesale_targets_pct: [11, 12.5, 15],
};

export async function getRules(c: PoolClient): Promise<DeskRules> {
  const r = await c.query<{ rules: Partial<DeskRules> }>(`SELECT rules FROM perfume.settings WHERE id = 1`);
  return { ...DEFAULT_RULES, ...(r.rows[0]?.rules ?? {}) };
}
export async function putRules(c: PoolClient, userId: string, patch: Partial<DeskRules>): Promise<DeskRules> {
  const next = { ...(await getRules(c)), ...patch };
  await c.query(
    `INSERT INTO perfume.settings (id, rules, updated_by, updated_at) VALUES (1, $1::jsonb, $2, now())
     ON CONFLICT (id) DO UPDATE SET rules = EXCLUDED.rules, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(next), userId],
  );
  return next;
}

/* ---------------- money parsing ---------------- */

/** "$1,234.5" / 45.5 / "45.50" → 4550 exact (string math, never float × 100). null when not a price. */
export function toCents(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return toCents(v.toFixed(6));
  }
  const s = String(v).replace(/[$,\s]/g, "").replace(/USD$/i, "");
  const m = s.match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const frac = (m[3] ?? "").padEnd(3, "0");
  let c = Number(m[2] || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) c += 1;                       // round half up at the third decimal
  return m[1] === "-" ? -c : c;
}

/* ---------------- vendors ---------------- */

export type VendorRow = {
  id: string; name: string; kind: "buy" | "sell" | "both";
  cushion_lo_cents: number | null; cushion_hi_cents: number | null; freight_lo_cents: number | null; freight_hi_cents: number | null;
  earn_pct: string | null; sells_by_box: boolean; contact: string | null; column_mapping: Record<string, unknown>;
};
export async function listVendors(c: PoolClient): Promise<VendorRow[]> {
  return (await c.query<VendorRow>(
    `SELECT id, name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping
       FROM perfume.vendors WHERE archived_at IS NULL ORDER BY lower(name)`,
  )).rows;
}
export type VendorInput = Partial<Omit<VendorRow, "id" | "earn_pct">> & { id?: string; name: string; earn_pct?: number | null };
export async function upsertVendor(c: PoolClient, userId: string, v: VendorInput): Promise<VendorRow> {
  const vals = [v.name.trim(), v.kind ?? "buy", v.cushion_lo_cents ?? null, v.cushion_hi_cents ?? null, v.freight_lo_cents ?? null,
    v.freight_hi_cents ?? null, v.earn_pct ?? null, v.sells_by_box ?? false, v.contact ?? null, JSON.stringify(v.column_mapping ?? {})];
  const r = v.id
    ? await c.query<VendorRow>(
      `UPDATE perfume.vendors SET name=$2, kind=$3, cushion_lo_cents=$4, cushion_hi_cents=$5, freight_lo_cents=$6, freight_hi_cents=$7,
              earn_pct=$8, sells_by_box=$9, contact=$10, column_mapping=$11::jsonb, updated_at=now()
        WHERE id=$1 RETURNING id, name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping`,
      [v.id, ...vals])
    : await c.query<VendorRow>(
      `INSERT INTO perfume.vendors (name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct, sells_by_box, contact, column_mapping, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       RETURNING id, name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping`,
      [...vals, userId]);
  if (!r.rows[0]) throw new Error("vendor_not_found");
  return r.rows[0];
}

/* ---------------- index ---------------- */

export async function loadIndex(c: PoolClient): Promise<MatchIndex> {
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const ix = emptyIndex(Object.fromEntries(ba.rows.map((r) => [r.alias, r.brand])));
  const items = await c.query<{ id: string; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; identity_key: string; loose_key: string; display_name: string }>(
    `SELECT id, brand, name, size_ml::text, conc, gender, flags, identity_key, loose_key, display_name FROM perfume.items WHERE merged_into_id IS NULL`);
  for (const i of items.rows) addItem(ix, { id: i.id, brand: i.brand, name: i.name, sizeMl: i.size_ml == null ? null : Number(i.size_ml), conc: i.conc,
    gender: i.gender, flags: i.flags, identityKey: i.identity_key, looseKey: i.loose_key, displayName: i.display_name });
  for (const u of (await c.query<{ upc: string; item_id: string }>(`SELECT upc, item_id FROM perfume.item_upcs`)).rows) ix.byUpc.set(u.upc, u.item_id);
  for (const a of (await c.query<{ vendor_id: string; sku: string | null; text_key: string | null; item_id: string }>(
    `SELECT vendor_id, sku, text_key, item_id FROM perfume.item_aliases`)).rows) {
    if (a.sku) ix.vendorSku.set(`${a.vendor_id}|${a.sku}`, a.item_id);
    if (a.text_key) ix.vendorText.set(`${a.vendor_id}|${a.text_key}`, a.item_id);
  }
  return ix;
}

/* ---------------- import ---------------- */

export type ImportRowIn = LineIn & { sheet?: string | null; row_no: number; raw?: unknown; price: unknown; qty?: unknown; case_pack?: unknown };
export type ImportIn = {
  vendor_id: string;
  list_date: string;
  label?: string | null;
  file_name: string;
  source_kind: "xlsx" | "xls" | "csv" | "pdf_text" | "image" | "manual";
  /** Data lines the reader saw in the file (header and blank lines excluded). */
  rows_read: number;
  /** Sum of every price the reader read from the file, in cents. Must equal the saved total. */
  file_price_total_cents: number;
  rows: ImportRowIn[];
  /**
   * true (default): this file is the vendor's full list and replaces the vendor's current list(s).
   * false: a supplement (new arrivals, specials) — it is added and the vendor's current list stays current.
   */
  replaces_current?: boolean;
};
export type ImportCheck = {
  rows_read: number; rows_saved: number; rows_skipped: number;
  price_total_file_cents: number; price_total_saved_cents: number; totals_match: boolean;
  by_method: Record<string, number>; review: number; unmatched: number; items_created: number; items_renamed: number; items_merged: number;
};

function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,+\s]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function prepare(body: ImportIn) {
  const saved = [] as Array<ImportRowIn & { price_cents: number }>;
  for (const r of body.rows) {
    const cents = toCents(r.price);
    const hasItem = Boolean(String(r.description ?? "").trim() || normalizeUpc(r.upc) || String(r.sku ?? "").trim());
    if (cents == null || cents <= 0 || !hasItem) continue;
    const description = String(r.description ?? "").trim() || String(r.sku ?? r.upc ?? "");
    // The vendor's own item code, when the list has no SKU column but prints it in the line: MTZ writes
    // "JO MALONE ENGLISH PEAR & FREESIA 1.0 EDC L UNBOXED  (137792) - France". Without it a no-barcode
    // tester/unboxed line can never become an item, and the same line next week can never re-link by SKU.
    const tail = vendorLineTail(description);
    const sku = String(r.sku ?? "").trim() || (tail.code ?? "");
    const casePack = r.case_pack == null || String(r.case_pack).trim() === "" ? tail.casePack : r.case_pack;
    saved.push({ ...r, sku: sku || null, case_pack: casePack, description, price_cents: cents });
  }
  const total = saved.reduce((t, r) => t + r.price_cents, 0);
  return { saved, total };
}

/** Dry run: what an import WOULD do. Writes nothing. */
export async function previewImport(c: PoolClient, body: ImportIn): Promise<ImportCheck> {
  const vendor = await vendorById(c, body.vendor_id);
  const ix = await loadIndex(c);
  const { saved, total } = prepare(body);
  const check = baseCheck(body, saved.length, total);
  let created = 0;
  for (const r of saved) {
    const m = matchLine(ix, vendor.id, r, { allowNewItem: vendor.kind !== "sell" });
    tally(check, m.method, m.status);
    if (m.method === "new_item") {
      created++;
      addItem(ix, { id: `preview-${created}`, brand: m.identity.brand, name: m.identity.nameText, sizeMl: m.identity.sizeMl, conc: m.identity.conc,
        gender: m.identity.gender, flags: m.identity.flags, identityKey: m.identity.key, looseKey: looseKey(m.identity), displayName: displayNameOf(m.identity) });
      if (m.upc) ix.byUpc.set(m.upc, `preview-${created}`);
    }
  }
  check.items_created = created;
  return check;
}

function baseCheck(body: ImportIn, savedCount: number, savedTotal: number): ImportCheck {
  return {
    rows_read: body.rows_read, rows_saved: savedCount, rows_skipped: body.rows_read - savedCount,
    price_total_file_cents: body.file_price_total_cents, price_total_saved_cents: savedTotal,
    totals_match: body.file_price_total_cents === savedTotal && body.rows_read >= savedCount,
    by_method: {}, review: 0, unmatched: 0, items_created: 0, items_renamed: 0, items_merged: 0,
  };
}
function tally(check: ImportCheck, method: string | null, status: string) {
  if (method) check.by_method[method] = (check.by_method[method] ?? 0) + 1;
  else if (status === "review") check.review++;
  else check.unmatched++;
}

async function vendorById(c: PoolClient, id: string): Promise<VendorRow> {
  const v = (await c.query<VendorRow>(`SELECT id, name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping FROM perfume.vendors WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!v) throw new Error("vendor_not_found");
  return v;
}

export class ImportCheckFailed extends Error {
  constructor(public check: ImportCheck) { super("import_check_failed"); }
}

/** Saves a list. Refuses (writes nothing) when the file total and the saved total differ by even one cent. */
export async function importList(c: PoolClient, userId: string, body: ImportIn): Promise<{ list_id: string; check: ImportCheck }> {
  const vendor = await vendorById(c, body.vendor_id);
  const { saved, total } = prepare(body);
  const check = baseCheck(body, saved.length, total);
  if (!check.totals_match) throw new ImportCheckFailed(check);

  const list = await c.query<{ id: string }>(
    `INSERT INTO perfume.price_lists (vendor_id, list_date, label, file_name, source_kind, rows_read, rows_saved, rows_skipped,
       price_total_file_cents, price_total_saved_cents, imported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [vendor.id, body.list_date, body.label ?? null, body.file_name, body.source_kind, check.rows_read, check.rows_saved, check.rows_skipped,
      check.price_total_file_cents, check.price_total_saved_cents, userId]);
  const listId = list.rows[0].id;
  if (body.replaces_current !== false) {
    await c.query(`UPDATE perfume.price_lists SET is_current = false WHERE vendor_id = $1 AND id <> $2 AND is_current`, [vendor.id, listId]);
  }

  // Pass 1 — match every line in memory. New items get a temporary id so later lines of the same file
  // link to them; nothing is written per line (one round-trip per 500 rows, not per row).
  const ix = await loadIndex(c);
  type Out = { sheet: string | null; row_no: number; raw: unknown; upc: string | null; sku: string | null; brand: string | null; description: string;
    size_text: string | null; price_cents: number; qty: number | null; case_pack: number | null; identity_key: string; loose_key: string;
    item_id: string | null; match_method: string | null; match_status: string; suggestions: unknown };
  const out: Out[] = [];
  const newItems: Array<{ tmp: string; brand: string; name: string; size_ml: number | null; conc: string; gender: string; flags: string[]; identity_key: string; loose_key: string; display_name: string }> = [];
  const newUpcs = new Map<string, string>();              // upc → item (tmp or real)
  const newSkus = new Map<string, string>();              // sku → item (tmp or real)
  const lineIds: Array<{ itemId: string | null; method: string | null; identity: Identity }> = [];
  for (const r of saved) {
    const m = matchLine(ix, vendor.id, r, { allowNewItem: vendor.kind !== "sell" });
    let itemId = m.itemId;
    if (m.method === "new_item") {
      const id = m.identity;
      itemId = `tmp:${newItems.length}`;
      newItems.push({ tmp: itemId, brand: id.brand, name: id.nameText, size_ml: id.sizeMl, conc: id.conc, gender: id.gender, flags: id.flags,
        identity_key: id.key, loose_key: looseKey(id), display_name: displayNameOf(id) });
      addItem(ix, { id: itemId, brand: id.brand, name: id.nameText, sizeMl: id.sizeMl, conc: id.conc, gender: id.gender, flags: id.flags,
        identityKey: id.key, looseKey: looseKey(id), displayName: displayNameOf(id) });
    }
    tally(check, m.method, m.status);
    lineIds.push({ itemId, method: m.method, identity: m.identity });
    const strong = itemId && m.method && m.method !== "loose_key";
    if (strong && m.upc && !ix.byUpc.has(m.upc)) { ix.byUpc.set(m.upc, itemId!); newUpcs.set(m.upc, itemId!); }
    const sku = String(r.sku ?? "").trim();
    if (strong && sku && !ix.vendorSku.has(`${vendor.id}|${sku}`)) { ix.vendorSku.set(`${vendor.id}|${sku}`, itemId!); newSkus.set(sku, itemId!); }
    out.push({
      sheet: r.sheet ?? null, row_no: r.row_no, raw: r.raw ?? {}, upc: m.upc || null, sku: sku || null, brand: r.brand ?? null,
      description: r.description, size_text: r.size_text ?? null, price_cents: r.price_cents, qty: intOrNull(r.qty), case_pack: intOrNull(r.case_pack),
      identity_key: m.identity.key, loose_key: looseKey(m.identity), item_id: itemId, match_method: m.method,
      match_status: itemId ? "matched" : m.status, suggestions: m.suggestions,
    });
  }
  // Pass 1b — HEAL. An item this list reaches by UPC or vendor SKU, that nobody confirmed by hand and that has no
  // internal code, takes the identity this (newer) list reads for it: identity rules improve, and the item must
  // not keep a name an older rule gave it ("4711 · U"). If another live item already holds that identity, the
  // two are the same bottle and the stale one is MERGED into it (merged_into_id; UPCs, aliases, rows repointed).
  const real = new Map<string, string>();
  const protectedIds = new Set((await c.query<{ id: string }>(
    `SELECT item_id AS id FROM perfume.item_aliases WHERE method = 'confirmed'
     UNION SELECT id FROM perfume.items WHERE internal_code IS NOT NULL AND merged_into_id IS NULL`)).rows.map((r) => r.id));
  const heals = new Map<string, Identity>();
  for (const l of lineIds) {
    if (!l.itemId || l.itemId.startsWith("tmp:") || (l.method !== "upc" && l.method !== "sku")) continue;
    if (protectedIds.has(l.itemId) || heals.has(l.itemId)) continue;
    const cur = ix.items.get(l.itemId);
    if (cur && cur.identityKey !== l.identity.key) heals.set(l.itemId, l.identity);
  }
  const mergedTo = new Map<string, string>();
  for (const [itemId, id] of heals) {
    const holder = (await c.query<{ id: string }>(
      `SELECT id FROM perfume.items WHERE identity_key = $1 AND merged_into_id IS NULL AND id <> $2 LIMIT 1`, [id.key, itemId])).rows[0]?.id;
    if (holder) {
      await c.query(`UPDATE perfume.items SET merged_into_id = $2, updated_at = now() WHERE id = $1`, [itemId, holder]);
      await c.query(`UPDATE perfume.item_upcs SET item_id = $2 WHERE item_id = $1`, [itemId, holder]);
      await c.query(`UPDATE perfume.item_aliases SET item_id = $2 WHERE item_id = $1`, [itemId, holder]);
      await c.query(`UPDATE perfume.price_list_rows SET item_id = $2 WHERE item_id = $1`, [itemId, holder]);
      mergedTo.set(itemId, holder);
      check.items_merged += 1;
    } else {
      await c.query(
        `UPDATE perfume.items SET brand = $2, name = $3, size_ml = $4, conc = $5, gender = $6, flags = $7, identity_key = $8,
                loose_key = $9, display_name = $10, updated_at = now() WHERE id = $1`,
        [itemId, id.brand, id.nameText, id.sizeMl, id.conc, id.gender, id.flags, id.key, looseKey(id), displayNameOf(id)]);
      check.items_renamed += 1;
    }
    // A line of this same file that would have created that identity as a NEW item is the healed item instead.
    const dup = newItems.findIndex((n) => n.identity_key === id.key);
    if (dup >= 0) { real.set(newItems[dup].tmp, mergedTo.get(itemId) ?? itemId); newItems.splice(dup, 1); }
  }
  check.items_created = newItems.length;

  // Pass 2 — write in batches. Temporary ids become real ids.
  for (let i = 0; i < newItems.length; i += 500) {
    const batch = newItems.slice(i, i + 500);
    const ins = await c.query<{ id: string; identity_key: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name, created_by)
       SELECT x.brand, x.name, x.size_ml, x.conc, x.gender, x.flags, x.identity_key, x.loose_key, x.display_name, $2
         FROM jsonb_to_recordset($1::jsonb) AS x(brand text, name text, size_ml numeric, conc text, gender text, flags text[], identity_key text, loose_key text, display_name text)
       RETURNING id, identity_key`,
      [JSON.stringify(batch), userId]);
    const byKey = new Map(ins.rows.map((r) => [r.identity_key, r.id]));
    for (const it of batch) {
      const id = byKey.get(it.identity_key);
      if (!id) throw new Error(`item_insert_lost: ${it.identity_key}`);
      real.set(it.tmp, id);
    }
  }
  const resolve = (v: string | null) => {
    const r = v && v.startsWith("tmp:") ? real.get(v) ?? null : v;
    return r && mergedTo.has(r) ? mergedTo.get(r)! : r;
  };
  for (const o of out) o.item_id = resolve(o.item_id);
  const upcRows = [...newUpcs].map(([upc, item]) => ({ upc, item_id: resolve(item) }));
  for (let i = 0; i < upcRows.length; i += 1000) {
    await c.query(
      `INSERT INTO perfume.item_upcs (upc, item_id, first_seen_list_id)
       SELECT x.upc, x.item_id, $2 FROM jsonb_to_recordset($1::jsonb) AS x(upc text, item_id uuid) ON CONFLICT (upc) DO NOTHING`,
      [JSON.stringify(upcRows.slice(i, i + 1000)), listId]);
  }
  const skuRows = [...newSkus].map(([sku, item]) => ({ sku, item_id: resolve(item) }));
  for (let i = 0; i < skuRows.length; i += 1000) {
    await c.query(
      `INSERT INTO perfume.item_aliases (item_id, vendor_id, sku, method)
       SELECT x.item_id, $2, x.sku, 'import' FROM jsonb_to_recordset($1::jsonb) AS x(sku text, item_id uuid) ON CONFLICT DO NOTHING`,
      [JSON.stringify(skuRows.slice(i, i + 1000)), vendor.id]);
  }
  for (let i = 0; i < out.length; i += 500) {
    await c.query(
      `INSERT INTO perfume.price_list_rows (list_id, sheet, row_no, raw, upc, sku, brand, description, size_text, price_cents, qty, case_pack,
         identity_key, loose_key, item_id, match_method, match_status, suggestions)
       SELECT $1, x.sheet, x.row_no, coalesce(x.raw, '{}'::jsonb), x.upc, x.sku, x.brand, x.description, x.size_text, x.price_cents, x.qty, x.case_pack,
              x.identity_key, x.loose_key, x.item_id, x.match_method, x.match_status, coalesce(x.suggestions, '[]'::jsonb)
         FROM jsonb_to_recordset($2::jsonb) AS x(sheet text, row_no int, raw jsonb, upc text, sku text, brand text, description text, size_text text,
              price_cents int, qty int, case_pack int, identity_key text, loose_key text, item_id uuid, match_method text, match_status text, suggestions jsonb)`,
      [listId, JSON.stringify(out.slice(i, i + 500))]);
  }
  // Re-read what was stored: the check is proven against the table, not against memory.
  const stored = await c.query<{ n: number; total: string }>(`SELECT count(*)::int AS n, coalesce(sum(price_cents),0)::text AS total FROM perfume.price_list_rows WHERE list_id = $1`, [listId]);
  if (stored.rows[0].n !== check.rows_saved || Number(stored.rows[0].total) !== check.price_total_saved_cents) {
    throw new Error(`import_store_mismatch: stored ${stored.rows[0].n} rows / ${stored.rows[0].total}¢, expected ${check.rows_saved} / ${check.price_total_saved_cents}¢`);
  }
  return { list_id: listId, check };
}

export async function listLists(c: PoolClient) {
  return (await c.query(
    `SELECT l.id, l.vendor_id, v.name AS vendor_name, v.kind, l.list_date::text, l.label, l.file_name, l.source_kind, l.rows_read, l.rows_saved, l.rows_skipped,
            l.price_total_file_cents::text, l.price_total_saved_cents::text, l.is_current, l.imported_at,
            (SELECT count(*)::int FROM perfume.price_list_rows r WHERE r.list_id = l.id AND r.match_status = 'matched') AS matched,
            (SELECT count(*)::int FROM perfume.price_list_rows r WHERE r.list_id = l.id AND r.match_status = 'review') AS review,
            (SELECT count(*)::int FROM perfume.price_list_rows r WHERE r.list_id = l.id AND r.match_status = 'unmatched') AS unmatched
       FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE l.voided_at IS NULL ORDER BY l.imported_at DESC`)).rows;
}

export async function voidList(c: PoolClient, listId: string, reason: string) {
  const r = await c.query(`UPDATE perfume.price_lists SET voided_at = now(), void_reason = $2, is_current = false WHERE id = $1 AND voided_at IS NULL RETURNING vendor_id`, [listId, reason]);
  if (!r.rowCount) throw new Error("list_not_found");
  // If that left the vendor with no current list, its newest remaining list becomes current again.
  await c.query(
    `UPDATE perfume.price_lists SET is_current = true WHERE id = (
       SELECT id FROM perfume.price_lists WHERE vendor_id = $1 AND voided_at IS NULL ORDER BY list_date DESC, imported_at DESC LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM perfume.price_lists WHERE vendor_id = $1 AND voided_at IS NULL AND is_current)`,
    [r.rows[0].vendor_id]);
}

/** Owner switch: count this list in the grid (current) or not. Voided lists cannot be switched. */
export async function setListCurrent(c: PoolClient, listId: string, current: boolean) {
  const r = await c.query(`UPDATE perfume.price_lists SET is_current = $2 WHERE id = $1 AND voided_at IS NULL`, [listId, current]);
  if (!r.rowCount) throw new Error("list_not_found");
}

/* ---------------- review & confirm ---------------- */

export async function reviewQueue(c: PoolClient, opts: { list_id?: string; limit: number; offset: number }) {
  const where = opts.list_id ? `AND r.list_id = $3` : "";
  const params: unknown[] = [opts.limit, opts.offset];
  if (opts.list_id) params.push(opts.list_id);
  const rows = await c.query(
    `SELECT r.id, r.list_id, v.name AS vendor_name, r.row_no, r.upc, r.sku, r.brand, r.description, r.size_text, r.case_pack, r.price_cents, r.match_status, r.suggestions
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.match_status <> 'matched' AND l.is_current AND l.voided_at IS NULL ${where}
      ORDER BY v.name, r.row_no LIMIT $1 OFFSET $2`, params);
  const total = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      WHERE r.match_status <> 'matched' AND l.is_current AND l.voided_at IS NULL ${opts.list_id ? "AND r.list_id = $1" : ""}`,
    opts.list_id ? [opts.list_id] : []);
  // The vendor's line split into the owner's columns: brand (canonical — CK → CALVIN KLEIN), model, size, type,
  // gender, tester/set, country, pieces per box, the vendor's code — the same reading the import engine used.
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const aliases = { ...BUILTIN_BRAND_ALIASES, ...Object.fromEntries(ba.rows.map((a) => [a.alias, a.brand])) };
  const out = rows.rows.map((r: Record<string, unknown>) => {
    const id = identify({ description: String(r.description ?? ""), brand: (r.brand as string | null) ?? null, size: (r.size_text as string | null) ?? null, brandAliases: aliases });
    const tail = vendorLineTail(String(r.description ?? ""));
    return { ...r, brand_name: id.brand || null, model: id.nameText || null, size_ml: id.sizeMl, conc: id.conc || null, gender: id.gender || null,
      flags: id.flags.join(" "), category: categoryOf(id.gender, id.flags), country: tail.country, case_pack: (r.case_pack as number | null) ?? tail.casePack, sku: (r.sku as string | null) ?? tail.code };
  });
  return { rows: out, total: total.rows[0].n };
}

/**
 * Owner confirms a line: it IS this item (or a new item). Remembered as this vendor's spelling and SKU, attaches
 * the line's UPC to the item, and applies to every other unconfirmed line of that vendor with the same spelling or SKU.
 */
export async function confirmRow(c: PoolClient, userId: string, rowId: string, target: { item_id?: string; create_new?: boolean }) {
  const row = (await c.query<{ id: string; list_id: string; vendor_id: string; upc: string | null; sku: string | null; brand: string | null; description: string; size_text: string | null; identity_key: string; loose_key: string }>(
    `SELECT r.id, r.list_id, l.vendor_id, r.upc, r.sku, r.brand, r.description, r.size_text, r.identity_key, r.loose_key
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id WHERE r.id = $1`, [rowId])).rows[0];
  if (!row) throw new Error("row_not_found");
  let itemId = target.item_id ?? null;
  if (!itemId && target.create_new) {
    const ix = await loadIndex(c);
    const m = matchLine(ix, row.vendor_id, { description: row.description, brand: row.brand, size_text: row.size_text }, { allowNewItem: false });
    const id = m.identity;
    if (!id.nameWords.length) throw new Error("item_needs_a_name");
    const ins = await c.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [id.brand, id.nameText, id.sizeMl, id.conc, id.gender, id.flags, id.key, looseKey(id), displayNameOf(id), userId]);
    itemId = ins.rows[0].id;
  }
  if (!itemId) throw new Error("item_required");
  const textKey = [row.brand ?? "", row.description, row.size_text ?? ""].join(" ").toUpperCase().replace(/\s+/g, " ").trim();
  await c.query(
    `INSERT INTO perfume.item_aliases (item_id, vendor_id, text_key, method, confirmed_by, confirmed_at) VALUES ($1,$2,$3,'confirmed',$4,now())
     ON CONFLICT (vendor_id, text_key) WHERE text_key IS NOT NULL DO UPDATE SET item_id = EXCLUDED.item_id, method = 'confirmed', confirmed_by = EXCLUDED.confirmed_by, confirmed_at = now()`,
    [itemId, row.vendor_id, textKey, userId]);
  if (row.sku) {
    await c.query(
      `INSERT INTO perfume.item_aliases (item_id, vendor_id, sku, method, confirmed_by, confirmed_at) VALUES ($1,$2,$3,'confirmed',$4,now())
       ON CONFLICT (vendor_id, sku) WHERE sku IS NOT NULL DO UPDATE SET item_id = EXCLUDED.item_id, method = 'confirmed', confirmed_by = EXCLUDED.confirmed_by, confirmed_at = now()`,
      [itemId, row.vendor_id, row.sku, userId]);
  }
  if (row.upc) await c.query(`INSERT INTO perfume.item_upcs (upc, item_id, first_seen_list_id) VALUES ($1,$2,$3) ON CONFLICT (upc) DO NOTHING`, [row.upc, itemId, row.list_id]);
  const applied = await c.query(
    `UPDATE perfume.price_list_rows r SET item_id = $1, match_method = 'confirmed', match_status = 'matched', suggestions = '[]'::jsonb
       FROM perfume.price_lists l
      WHERE l.id = r.list_id AND l.vendor_id = $2 AND r.match_status <> 'matched'
        AND (r.id = $3 OR (upper(regexp_replace(concat_ws(' ', coalesce(r.brand,''), r.description, coalesce(r.size_text,'')), '\\s+', ' ', 'g')) = $4)
             OR ($5::text IS NOT NULL AND r.sku = $5))`,
    [itemId, row.vendor_id, rowId, textKey, row.sku]);
  return { item_id: itemId, rows_linked: applied.rowCount ?? 0 };
}

export async function searchItems(c: PoolClient, q: string, limit = 25) {
  const s = q.trim();
  if (!s) return [];
  return (await c.query(
    `SELECT i.id, i.display_name, i.internal_code, (SELECT array_agg(u.upc) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs
       FROM perfume.items i
      WHERE i.merged_into_id IS NULL AND (i.display_name ILIKE '%' || $1 || '%' OR i.internal_code = $1
            OR EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = i.id AND u.upc = ltrim(regexp_replace($1,'\\D','','g'),'0')))
      ORDER BY similarity(i.display_name, $1) DESC LIMIT $2`, [s, limit])).rows;
}

export async function setInternalCode(c: PoolClient, itemId: string, code: string | null) {
  await c.query(`UPDATE perfume.items SET internal_code = NULLIF(btrim($2), ''), updated_at = now() WHERE id = $1`, [itemId, code]);
}

/* ---------------- the grid ---------------- */

export type ColKind = "text" | "money" | "pct" | "int";
export type GridCol = { key: string; label: string; group: string; kind: ColKind };
export type GridView = "buy" | "sell" | "wholesale" | "all";
export type GridRow = Record<string, string | number | null>;

export async function buildGrid(c: PoolClient): Promise<{ cols: GridCol[]; rows: GridRow[]; rules: DeskRules; vendors: VendorRow[] }> {
  const rules = await getRules(c);
  const vendors = await listVendors(c);
  const buyV = vendors.filter((v) => v.kind !== "sell");
  const sellV = vendors.filter((v) => v.kind !== "buy");
  const prices = await c.query<{ item_id: string; vendor_id: string; price_cents: number; qty: number | null; case_pack: number | null; sku: string | null; description: string }>(
    // A vendor can have several current lists (full list + new arrivals). For each item the vendor's NEWEST
    // current list that carries it sets the price (list date, then import time); within that list, the lowest line.
    `SELECT DISTINCT ON (r.item_id, l.vendor_id) r.item_id, l.vendor_id, r.price_cents::int AS price_cents, r.qty, r.case_pack, r.sku, r.description
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      WHERE r.item_id IS NOT NULL AND l.is_current AND l.voided_at IS NULL
      ORDER BY r.item_id, l.vendor_id, l.list_date DESC, l.imported_at DESC, r.price_cents ASC`);
  const items = await c.query<{ id: string; internal_code: string | null; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; display_name: string; upcs: string[] | null }>(
    `SELECT i.id, i.internal_code, i.brand, i.name, i.size_ml::text, i.conc, i.gender, i.flags, i.display_name,
            (SELECT array_agg(u.upc ORDER BY u.created_at) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs
       FROM perfume.items i WHERE i.merged_into_id IS NULL`);
  const byItem = new Map<string, Map<string, { price: number; qty: number | null; case_pack: number | null; sku: string | null; country: string | null }>>();
  for (const p of prices.rows) {
    const m = byItem.get(p.item_id) ?? new Map();
    m.set(p.vendor_id, { price: p.price_cents, qty: p.qty, case_pack: p.case_pack, sku: p.sku, country: vendorLineTail(p.description).country });
    byItem.set(p.item_id, m);
  }
  const close = (v: number | null) => (v == null ? null : closeCents(v, rules.round_step, rules.round_dir));

  const cols: GridCol[] = [
    { key: "code", label: "Internal code", group: "Item", kind: "text" },
    { key: "upc", label: "UPC", group: "Item", kind: "text" },
    { key: "upc_count", label: "# UPCs", group: "Item", kind: "int" },
    { key: "sku", label: "Vendor SKU", group: "Item", kind: "text" },
    { key: "brand", label: "Brand", group: "Item", kind: "text" },
    { key: "name", label: "Name", group: "Item", kind: "text" },
    { key: "size_ml", label: "Size ml", group: "Item", kind: "int" },
    { key: "conc", label: "Type", group: "Item", kind: "text" },
    { key: "gender", label: "Gender", group: "Item", kind: "text" },
    { key: "category", label: "Category", group: "Item", kind: "text" },
    { key: "flags", label: "Tester / set", group: "Item", kind: "text" },
    { key: "country", label: "Country", group: "Item", kind: "text" },
  ];
  for (const v of buyV) {
    cols.push({ key: `v:${v.id}:price`, label: "Price", group: v.name, kind: "money" });
    cols.push({ key: `v:${v.id}:landed`, label: "Landed likely", group: v.name, kind: "money" });
    cols.push({ key: `v:${v.id}:rank`, label: "Rank", group: v.name, kind: "int" });
    cols.push({ key: `v:${v.id}:qty`, label: "Qty", group: v.name, kind: "int" });
  }
  cols.push(
    { key: "best_vendor", label: "Buy from", group: "Purchase", kind: "text" },
    { key: "tied", label: "Tied vendors", group: "Purchase", kind: "int" },
    { key: "n_vendors", label: "# vendors", group: "Purchase", kind: "int" },
    { key: "best_price", label: "Vendor price", group: "Purchase", kind: "money" },
    { key: "cushion", label: "Cushion", group: "Purchase", kind: "money" },
    { key: "freight", label: "Freight / pc", group: "Purchase", kind: "money" },
    { key: "landed_likely", label: "My cost (likely)", group: "Purchase", kind: "money" },
    { key: "landed_best", label: "My cost (best case)", group: "Purchase", kind: "money" },
    { key: "saves_next", label: "Saves vs next", group: "Purchase", kind: "money" },
    { key: "vendor_cost", label: "Vendor's est. cost", group: "Purchase", kind: "money" },
    { key: "case_pack", label: "Box qty", group: "Purchase", kind: "int" },
  );
  for (const v of sellV) cols.push({ key: `s:${v.id}:price`, label: "List price", group: v.name, kind: "money" });
  cols.push(
    { key: "low_sell", label: "Lowest list price", group: "Laredo", kind: "money" },
    { key: "low_sell_vendor", label: "Lowest at", group: "Laredo", kind: "text" },
    { key: "profit", label: "Profit / pc", group: "Laredo", kind: "money" },
    { key: "margin", label: "Margin %", group: "Laredo", kind: "pct" },
    { key: "markup", label: "Markup %", group: "Laredo", kind: "pct" },
    { key: "store_cost_margin", label: `Store's cost @${rules.store_earn_pct}% margin`, group: "Sell to stores", kind: "money" },
    { key: "store_cost_markup", label: `Store's cost @${rules.store_earn_pct}% markup`, group: "Sell to stores", kind: "money" },
    { key: "offer_store", label: "My offer to store", group: "Sell to stores", kind: "money" },
    { key: "offer_profit", label: "My profit", group: "Sell to stores", kind: "money" },
    { key: "offer_margin", label: "My margin %", group: "Sell to stores", kind: "pct" },
    { key: "offer_markup", label: "My markup %", group: "Sell to stores", kind: "pct" },
  );
  for (const t of rules.wholesale_targets_pct) {
    cols.push({ key: `w:${t}:margin`, label: `Price @${t}% margin`, group: "Wholesale", kind: "money" });
    cols.push({ key: `w:${t}:markup`, label: `Price @${t}% markup`, group: "Wholesale", kind: "money" });
  }

  const vName = new Map(vendors.map((v) => [v.id, v.name]));
  const rows: GridRow[] = [];
  for (const it of items.rows) {
    const offersMap = byItem.get(it.id) ?? new Map();
    const row: GridRow = {
      id: it.id, code: it.internal_code, upc: it.upcs?.[0] ?? null, upc_count: it.upcs?.length ?? 0, brand: it.brand, name: it.name,
      size_ml: it.size_ml == null ? null : Number(it.size_ml), conc: it.conc, gender: it.gender, category: categoryOf(it.gender, it.flags), flags: it.flags.join(" "), display_name: it.display_name,
      upcs: (it.upcs ?? []).join(" "),
    };
    const offers = buyV.filter((v) => offersMap.has(v.id)).map((v) => ({
      vendorId: v.id, listedCents: offersMap.get(v.id)!.price,
      cushionLoCents: v.cushion_lo_cents ?? rules.cushion_lo_cents, cushionHiCents: v.cushion_hi_cents ?? rules.cushion_hi_cents,
      freightLoCents: v.freight_lo_cents ?? rules.freight_lo_cents, freightHiCents: v.freight_hi_cents ?? rules.freight_hi_cents,
    }));
    const ranked = rankOffers(offers);
    for (const o of ranked) {
      row[`v:${o.vendorId}:price`] = o.listedCents;
      row[`v:${o.vendorId}:landed`] = o.likelyCents;
      row[`v:${o.vendorId}:rank`] = o.rank;
      row[`v:${o.vendorId}:qty`] = offersMap.get(o.vendorId)!.qty;
    }
    const best = ranked[0];
    if (best) {
      const winners = ranked.filter((o) => o.rank === 1);
      row.best_vendor = winners.map((o) => vName.get(o.vendorId)).join(" | ");
      row.tied = winners.length > 1 ? winners.length : 0;
      row.n_vendors = ranked.length;
      row.best_price = best.listedCents;
      row.cushion = best.cushionLoCents;
      row.freight = best.freightHiCents;
      row.landed_likely = best.likelyCents;
      row.landed_best = best.bestCaseCents;
      row.saves_next = ranked.find((o) => o.rank > 1) ? ranked.find((o) => o.rank > 1)!.likelyCents - best.likelyCents : null;
      const ve = buyV.find((v) => v.id === best.vendorId)!;
      row.vendor_cost = close(costFromPrice(best.listedCents - best.cushionHiCents, ve.earn_pct == null ? rules.vendor_earn_pct : Number(ve.earn_pct), "markup"));
      row.case_pack = offersMap.get(best.vendorId)!.case_pack;
      row.sku = offersMap.get(best.vendorId)!.sku;
      row.country = offersMap.get(best.vendorId)!.country;
    } else {
      row.n_vendors = 0;
    }
    let low: number | null = null, lowAt: string | null = null;
    for (const v of sellV) {
      const p = offersMap.get(v.id)?.price;
      if (p == null) continue;
      row[`s:${v.id}:price`] = p;
      if (low == null || p < low) { low = p; lowAt = v.name; }
    }
    row.low_sell = low;
    row.low_sell_vendor = lowAt;
    const cost = (row.landed_likely as number | null) ?? null;
    if (low != null) {
      row.profit = cost == null ? null : low - cost;
      row.margin = round1(marginPct(low, cost));
      row.markup = round1(markupPct(low, cost));
      row.store_cost_margin = close(costFromPrice(low, rules.store_earn_pct, "margin"));
      row.store_cost_markup = close(costFromPrice(low, rules.store_earn_pct, "markup"));
      row.offer_store = row.store_cost_margin;
      row.offer_profit = cost == null ? null : (row.offer_store as number) - cost;
      row.offer_margin = round1(marginPct(row.offer_store as number, cost));
      row.offer_markup = round1(markupPct(row.offer_store as number, cost));
    }
    if (cost != null) for (const t of rules.wholesale_targets_pct) {
      row[`w:${t}:margin`] = close(priceFromCost(cost, t, "margin"));
      row[`w:${t}:markup`] = close(priceFromCost(cost, t, "markup"));
    }
    rows.push(row);
  }
  return { cols, rows, rules, vendors };
}

function round1(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}

export function filterView(rows: GridRow[], view: GridView): GridRow[] {
  if (view === "buy") return rows.filter((r) => (r.n_vendors as number) > 0);
  if (view === "sell") return rows.filter((r) => r.low_sell != null);
  if (view === "wholesale") return rows.filter((r) => r.landed_likely != null);
  return rows;
}

export function searchRows(rows: GridRow[], q: string): GridRow[] {
  const s = q.trim().toUpperCase();
  if (!s) return rows;
  const digits = s.replace(/\D/g, "").replace(/^0+/, "");
  return rows.filter((r) => `${r.code ?? ""} ${r.upcs ?? ""} ${r.sku ?? ""} ${r.brand ?? ""} ${r.name ?? ""} ${r.display_name ?? ""}`.toUpperCase().includes(s)
    || (digits.length >= 6 && String(r.upcs ?? "").includes(digits)));
}

/** Sort any column ascending or descending; empty cells always last; text compares A→Z, numbers numerically. */
export function sortRows(rows: GridRow[], key: string, dir: "asc" | "desc"): GridRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = a[key], y = b[key];
    const xe = x == null || x === "", ye = y == null || y === "";
    if (xe && ye) return String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""));
    if (xe) return 1;
    if (ye) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
    return c === 0 ? String(a.display_name ?? "").localeCompare(String(b.display_name ?? "")) : c * sign;
  });
}

/* ---------------- Excel export ---------------- */

/** One sheet of the view's visible columns, values as real numbers, plus a "How computed" sheet; landed cost,
 *  margin and markup are live Excel formulas so anyone can audit them in Excel. */
export async function exportWorkbook(cols: GridCol[], rows: GridRow[], rules: DeskRules, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TIO Perfumes price desk";
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.addRow(cols.map((c) => (c.group && c.group !== "Item" ? `${c.group} · ${c.label}` : c.label)));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const idx = (k: string) => cols.findIndex((c) => c.key === k);
  const L = (i: number) => ws.getColumn(i + 1).letter;
  rows.forEach((r, n) => {
    const excelRow = n + 2;
    const values = cols.map((c) => {
      const v = r[c.key];
      if (v == null) return null;
      if (c.kind === "money") return Number(v) / 100;
      if (c.kind === "pct") return Number(v) / 100;
      return v;
    });
    const row = ws.addRow(values);
    // Live formulas: My cost = vendor price − cushion + freight; margin and markup from it.
    const p = idx("best_price"), cu = idx("cushion"), fr = idx("freight"), lk = idx("landed_likely"), lo = idx("low_sell"), mg = idx("margin"), mk = idx("markup"), pf = idx("profit");
    if (p >= 0 && cu >= 0 && fr >= 0 && lk >= 0 && r.best_price != null) {
      row.getCell(lk + 1).value = { formula: `${L(p)}${excelRow}-${L(cu)}${excelRow}+${L(fr)}${excelRow}`, result: Number(r.landed_likely) / 100 };
      if (lo >= 0 && r.low_sell != null) {
        if (pf >= 0) row.getCell(pf + 1).value = { formula: `${L(lo)}${excelRow}-${L(lk)}${excelRow}`, result: Number(r.profit) / 100 };
        if (mg >= 0) row.getCell(mg + 1).value = { formula: `(${L(lo)}${excelRow}-${L(lk)}${excelRow})/${L(lo)}${excelRow}`, result: Number(r.margin) / 100 };
        if (mk >= 0) row.getCell(mk + 1).value = { formula: `(${L(lo)}${excelRow}-${L(lk)}${excelRow})/${L(lk)}${excelRow}`, result: Number(r.markup) / 100 };
      }
    }
  });
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.kind === "money") col.numFmt = '"$"#,##0.00';
    if (c.kind === "pct") col.numFmt = "0.0%";
    col.width = c.key === "name" ? 40 : c.kind === "text" ? 18 : 13;
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const how = wb.addWorksheet("How computed");
  for (const line of [
    ["My cost (likely)", "Vendor price − low cushion + high freight (the safe number)"],
    ["My cost (best case)", "Vendor price − high cushion + low freight"],
    ["Margin %", "(Lowest Laredo list price − my cost) ÷ list price"],
    ["Markup %", "(Lowest Laredo list price − my cost) ÷ my cost"],
    ["Store's cost @ margin", `List price × (1 − ${rules.store_earn_pct}%)`],
    ["Store's cost @ markup", `List price ÷ (1 + ${rules.store_earn_pct}%)`],
    ["Closed numbers", `Every computed price rounds ${rules.round_dir} to ${rules.round_step === "75" ? "a price ending in .75" : `$${(Number(rules.round_step) / 100).toFixed(2)}`}`],
    ["Default cushion", `$${(rules.cushion_lo_cents / 100).toFixed(2)} – $${(rules.cushion_hi_cents / 100).toFixed(2)} (each vendor can override)`],
    ["Default freight", `$${(rules.freight_lo_cents / 100).toFixed(2)} – $${(rules.freight_hi_cents / 100).toFixed(2)} per piece`],
  ]) how.addRow(line);
  how.getColumn(1).width = 26; how.getColumn(2).width = 80;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
