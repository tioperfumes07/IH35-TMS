/**
 * PERFUME-DESK service — the only writer of perfume.*. Owner-only (RLS + route guard). Never touches a
 * carrier table and never posts to the GL. Every amount is integer cents.
 */
import type { PoolClient } from "pg";
import ExcelJS from "exceljs";
import { addItem, displayNameOf, emptyIndex, matchLine, type LineIn, type MatchIndex } from "./matching.js";
import { BUILTIN_BRAND_ALIASES, canonicalBrand, categoryOf, identify, looseKey, normalizeUpc, vendorLineTail, type Identity } from "./normalize.js";
import { offerCandidates, type OfferItem } from "./offer-review.js";
import { likelyLines, type CompetitorLine, type LineCandidate } from "./my-unlinked.js";
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
  /** Cushion my suppliers give a competitor, by list price: the highest tier whose `over_cents` the price exceeds
   * applies. Owner 2026-11-12: ".25 under 10 dollars, .50 of items over 10 dollars, 1.00 of items over 30 dollars".
   * Used to estimate a competitor's cost, and from it the margin the competitor earns. */
  competitor_cushion_tiers: Array<{ over_cents: number; cushion_cents: number }>;
  columns?: Record<string, string[]>;
};
export const DEFAULT_RULES: DeskRules = {
  round_step: "50", round_dir: "up", cushion_lo_cents: 25, cushion_hi_cents: 50, freight_lo_cents: 35, freight_hi_cents: 45,
  vendor_earn_pct: 16, store_earn_pct: 16, wholesale_targets_pct: [11, 12.5, 15],
  competitor_cushion_tiers: [{ over_cents: 0, cushion_cents: 25 }, { over_cents: 1000, cushion_cents: 50 }, { over_cents: 3000, cushion_cents: 100 }],
};

/** The cushion a supplier gives on an item at this list price under the tiers (0 when no tier applies). */
export function tieredCushionCents(priceCents: number, tiers: DeskRules["competitor_cushion_tiers"]): number {
  let best: { over_cents: number; cushion_cents: number } | null = null;
  for (const t of tiers ?? []) if (priceCents > t.over_cents && (best == null || t.over_cents > best.over_cents)) best = t;
  return best?.cushion_cents ?? 0;
}

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
  id: string; name: string; short_name: string | null; kind: "buy" | "sell" | "both" | "offer" | "inventory";
  cushion_lo_cents: number | null; cushion_hi_cents: number | null; freight_lo_cents: number | null; freight_hi_cents: number | null;
  earn_pct: string | null; sells_by_box: boolean; contact: string | null; column_mapping: Record<string, unknown>;
};
export async function listVendors(c: PoolClient): Promise<VendorRow[]> {
  return (await c.query<VendorRow>(
    `SELECT id, name, short_name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping
       FROM perfume.vendors WHERE archived_at IS NULL ORDER BY lower(name)`,
  )).rows;
}
export type VendorInput = Partial<Omit<VendorRow, "id" | "earn_pct">> & { id?: string; name: string; earn_pct?: number | null };
/** The column header for a vendor: the owner's short name (PCA, MTZ, NAND, PPW …), else the full name. */
export const vendorLabel = (v: Pick<VendorRow, "name" | "short_name">): string => (v.short_name?.trim() || v.name);
export async function upsertVendor(c: PoolClient, userId: string, v: VendorInput): Promise<VendorRow> {
  const vals = [v.name.trim(), v.kind ?? "buy", v.cushion_lo_cents ?? null, v.cushion_hi_cents ?? null, v.freight_lo_cents ?? null,
    v.freight_hi_cents ?? null, v.earn_pct ?? null, v.sells_by_box ?? false, v.contact ?? null, JSON.stringify(v.column_mapping ?? {}),
    v.short_name?.trim() ? v.short_name.trim().toUpperCase() : null];
  const r = v.id
    ? await c.query<VendorRow>(
      `UPDATE perfume.vendors SET name=$2, kind=$3, cushion_lo_cents=$4, cushion_hi_cents=$5, freight_lo_cents=$6, freight_hi_cents=$7,
              earn_pct=$8, sells_by_box=$9, contact=$10, column_mapping=$11::jsonb, short_name=$12, updated_at=now()
        WHERE id=$1 RETURNING id, name, short_name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping`,
      [v.id, ...vals])
    : await c.query<VendorRow>(
      `INSERT INTO perfume.vendors (name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct, sells_by_box, contact, column_mapping, short_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
       RETURNING id, name, short_name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping`,
      [...vals, userId]);
  if (!r.rows[0]) throw new Error("vendor_not_found");
  return r.rows[0];
}

/* ---------------- brand canon ---------------- */

/**
 * Owner 2026-11-12 ("perfumes completely done"): the item master spells some brands two ways (CALVIN / CALVIN KLEIN,
 * NARCISO / NARCISO R / NARCISO RODRIGUEZ, STERLING / STERLING PARFUMS …), so the same bottle can sit twice and a
 * line under one spelling never meets the item under the other. Every live item takes its canonical brand; when
 * an item with that canonical identity already exists, the two are the same bottle and the respelled one is MERGED
 * into it — UPCs, aliases and price-list rows repointed — exactly as an import's heal does. Idempotent.
 */
export async function canonicalizeItemBrands(c: PoolClient): Promise<{ checked: number; renamed: number; merged: number; brands: Record<string, string> }> {
  const aliases = Object.fromEntries((await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`)).rows.map((r) => [r.alias, r.brand]));
  const items = (await c.query<{ id: string; brand: string; identity_key: string; display_name: string }>(
    `SELECT id, brand, identity_key, display_name FROM perfume.items WHERE merged_into_id IS NULL AND brand <> '' ORDER BY created_at, id`)).rows;
  let renamed = 0, merged = 0;
  const brands: Record<string, string> = {};
  for (const it of items) {
    const canon = canonicalBrand(it.brand, aliases);
    if (!canon || canon === it.brand) continue;
    brands[it.brand] = canon;
    const parts = it.identity_key.split("|");
    if (parts[0] !== it.brand) continue; // a key written under another rule — left to the next import's heal
    parts[0] = canon;
    const key = parts.join("|");
    const display = it.display_name.startsWith(`${it.brand} · `) ? `${canon} · ${it.display_name.slice(it.brand.length + 3)}` : it.display_name;
    const holder = (await c.query<{ id: string }>(
      `SELECT id FROM perfume.items WHERE identity_key = $1 AND merged_into_id IS NULL AND id <> $2 LIMIT 1`, [key, it.id])).rows[0]?.id;
    if (holder) {
      await c.query(`UPDATE perfume.items SET merged_into_id = $2, updated_at = now() WHERE id = $1`, [it.id, holder]);
      await c.query(`UPDATE perfume.item_upcs SET item_id = $2 WHERE item_id = $1`, [it.id, holder]);
      await c.query(`UPDATE perfume.item_aliases SET item_id = $2 WHERE item_id = $1`, [it.id, holder]);
      await c.query(`UPDATE perfume.price_list_rows SET item_id = $2 WHERE item_id = $1`, [it.id, holder]);
      merged++;
    } else {
      await c.query(`UPDATE perfume.items SET brand = $2, identity_key = $3, display_name = $4, updated_at = now() WHERE id = $1`, [it.id, canon, key, display]);
      renamed++;
    }
  }
  return { checked: items.length, renamed, merged, brands };
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

export type ImportRowIn = LineIn & { sheet?: string | null; row_no: number; raw?: unknown; price: unknown; qty?: unknown; case_pack?: unknown;
  purchase_date?: string | null; qty_purchased?: unknown; qty_sold?: unknown };
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
  by_method: Record<string, number>; review: number; unmatched: number; items_created: number; items_renamed: number; items_merged: number; upcs_on_two_products: number;
};

/** A purchase date as the owner's file gives it: 2026-11-01, 11/1/26, 11/01/2026 or an Excel day number → YYYY-MM-DD; else null. */
export function dateOrNull(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const us = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (us) { m = +us[1]; d = +us[2]; y = +us[3]; if (y < 100) y += 2000; }
  else if (/^\d{5}(\.\d+)?$/.test(t)) { const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

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
  const sharedUpcs = ambiguousUpcs(saved, ix.brandAliases);
  check.upcs_on_two_products = sharedUpcs.size;
  for (const r0 of saved) {
    const r = sharedUpcs.has(normalizeUpc(r0.upc)) ? { ...r0, upc: null } : r0;
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
    by_method: {}, review: 0, unmatched: 0, items_created: 0, items_renamed: 0, items_merged: 0, upcs_on_two_products: 0,
  };
}
function tally(check: ImportCheck, method: string | null, status: string) {
  if (method) check.by_method[method] = (check.by_method[method] ?? 0) + 1;
  else if (status === "review") check.review++;
  else check.unmatched++;
}

async function vendorById(c: PoolClient, id: string): Promise<VendorRow> {
  const v = (await c.query<VendorRow>(`SELECT id, name, short_name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping FROM perfume.vendors WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!v) throw new Error("vendor_not_found");
  return v;
}

export class ImportCheckFailed extends Error {
  constructor(public check: ImportCheck) { super("import_check_failed"); }
}

/** Saves a list. Refuses (writes nothing) when the file total and the saved total differ by even one cent. */
/** Items whose earliest priced line came from ANOTHER vendor (that vendor created them), excluding the list being saved.
 *  An item no line has priced yet belongs to no vendor and is not in this set. */
export async function itemsCreatedByOtherVendors(c: PoolClient, vendorId: string, excludeListId: string | null): Promise<Set<string>> {
  const r = await c.query<{ item_id: string }>(
    `SELECT item_id FROM (
       SELECT DISTINCT ON (r.item_id) r.item_id, l.vendor_id
         FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
        WHERE r.item_id IS NOT NULL AND ($2::uuid IS NULL OR l.id <> $2::uuid)
        ORDER BY r.item_id, l.imported_at, r.created_at) first
      WHERE vendor_id <> $1`, [vendorId, excludeListId]);
  return new Set(r.rows.map((x) => x.item_id));
}

/** UPCs that one file prints on two products with different identities (different name, size, type …). */
export function ambiguousUpcs(rows: Array<{ upc?: unknown; description: string; brand?: string | null; size_text?: string | null; gender?: string | null; type?: string | null; section?: string | null }>, aliases: Record<string, string>): Set<string> {
  const keys = new Map<string, Set<string>>();
  for (const r of rows) {
    const u = normalizeUpc(r.upc);
    if (!u) continue;
    const id = identify({ description: r.description, brand: r.brand, size: r.size_text, gender: r.gender, type: r.type, section: r.section, brandAliases: aliases });
    (keys.get(u) ?? keys.set(u, new Set()).get(u)!).add(id.key);
  }
  return new Set([...keys].filter(([, k]) => k.size > 1).map(([u]) => u));
}

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
    // A full list REPLACES the vendor's older lists (owner 2026-11-12: "we cannot have old lists we replace with the new
    // ones"): they are voided — gone from the Lists tab, the grid and review — and kept only as the audit record.
    await c.query(
      `UPDATE perfume.price_lists SET is_current = false, voided_at = now(), void_reason = $3
        WHERE vendor_id = $1 AND id <> $2 AND voided_at IS NULL`,
      [vendor.id, listId, `Replaced by ${body.file_name} (${body.list_date})`]);
  }

  // Pass 1 — match every line in memory. New items get a temporary id so later lines of the same file
  // link to them; nothing is written per line (one round-trip per 500 rows, not per row).
  const ix = await loadIndex(c);
  type Out = { sheet: string | null; row_no: number; raw: unknown; upc: string | null; sku: string | null; brand: string | null; description: string;
    size_text: string | null; price_cents: number; qty: number | null; case_pack: number | null; identity_key: string; loose_key: string;
    purchase_date: string | null; qty_purchased: number | null; qty_sold: number | null;
    item_id: string | null; match_method: string | null; match_status: string; suggestions: unknown };
  const out: Out[] = [];
  const newItems: Array<{ tmp: string; brand: string; name: string; size_ml: number | null; conc: string; gender: string; flags: string[]; identity_key: string; loose_key: string; display_name: string }> = [];
  const newUpcs = new Map<string, string>();              // upc → item (tmp or real)
  const newSkus = new Map<string, string>();              // sku → item (tmp or real)
  const lineIds: Array<{ itemId: string | null; method: string | null; identity: Identity }> = [];
  // A UPC this file prints on two DIFFERENT products (PCA 11/10/2026: one UPC on "AL HARAMAIN AMBER" and "BAHR") is a
  // vendor error: for those lines the UPC is not trusted — each line matches by its own name (audit 2026-11-12).
  const sharedUpcs = ambiguousUpcs(saved, ix.brandAliases);
  check.upcs_on_two_products = sharedUpcs.size;
  // Items ANOTHER vendor's lines created (their earliest priced line): this vendor's list never re-reads (heals) them —
  // a list with no gender/type column (Lux America) must not strip what MTZ read (audit 2026-11-12: 124 items
  // degraded by the Lux import). The UPC still links the bottle whatever each vendor calls it (owner 2026-11-12:
  // "a upc might have confusing descriptions depending on the vendor").
  const foreignItems = await itemsCreatedByOtherVendors(c, vendor.id, listId);
  for (const r0 of saved) {
    const shared = sharedUpcs.has(normalizeUpc(r0.upc));
    const r = shared ? { ...r0, upc: null } : r0;
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
      sheet: r.sheet ?? null, row_no: r.row_no, raw: r.raw ?? {}, upc: normalizeUpc(r0.upc) || null, sku: sku || null, brand: r.brand ?? null,
      description: r.description, size_text: r.size_text ?? null, price_cents: r.price_cents, qty: intOrNull(r.qty), case_pack: intOrNull(r.case_pack),
      purchase_date: dateOrNull(r.purchase_date), qty_purchased: intOrNull(r.qty_purchased), qty_sold: intOrNull(r.qty_sold),
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
    if (protectedIds.has(l.itemId) || heals.has(l.itemId) || foreignItems.has(l.itemId)) continue;
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
         purchase_date, qty_purchased, qty_sold, identity_key, loose_key, item_id, match_method, match_status, suggestions)
       SELECT $1, x.sheet, x.row_no, coalesce(x.raw, '{}'::jsonb), x.upc, x.sku, x.brand, x.description, x.size_text, x.price_cents, x.qty, x.case_pack,
              x.purchase_date, x.qty_purchased, x.qty_sold, x.identity_key, x.loose_key, x.item_id, x.match_method, x.match_status, coalesce(x.suggestions, '[]'::jsonb)
         FROM jsonb_to_recordset($2::jsonb) AS x(sheet text, row_no int, raw jsonb, upc text, sku text, brand text, description text, size_text text,
              price_cents int, qty int, case_pack int, purchase_date date, qty_purchased int, qty_sold int, identity_key text, loose_key text, item_id uuid, match_method text, match_status text, suggestions jsonb)`,
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
    `SELECT l.id, l.vendor_id, COALESCE(NULLIF(btrim(v.short_name), ''), v.name) AS vendor_name, v.kind, l.list_date::text, l.label, l.file_name, l.source_kind, l.rows_read, l.rows_saved, l.rows_skipped,
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

export async function reviewQueue(c: PoolClient, opts: { list_id?: string; list_ids?: string[]; q?: string; status?: "review" | "unmatched"; mine?: "offer"; limit: number; offset: number }) {
  // Filters (owner 2026-11-12: "1788 items, lets have the filters"): one vendor list, words in the vendor's line,
  // and "has a suggestion" (review) vs "nothing close" (unmatched).
  const cond: string[] = [];
  const fp: unknown[] = [];
  const lists = [...(opts.list_ids ?? []), ...(opts.list_id ? [opts.list_id] : [])];
  if (lists.length) { fp.push(lists); cond.push(`r.list_id = ANY($${fp.length}::uuid[])`); }
  if (opts.status) { fp.push(opts.status); cond.push(`r.match_status = $${fp.length}`); }
  for (const w of (opts.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    fp.push(w); cond.push(`(r.description ILIKE '%' || $${fp.length} || '%' OR coalesce(r.brand,'') ILIKE '%' || $${fp.length} || '%' OR coalesce(r.upc,'') = $${fp.length} OR coalesce(r.sku,'') = $${fp.length})`);
  }
  const where = cond.length ? `AND ${cond.join(" AND ")}` : "";
  const base = `FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.match_status <> 'matched' AND l.is_current AND l.voided_at IS NULL ${where}`;
  // Narrowed to my offer list: every waiting line is read (a few thousand at most) and kept only when it can be one
  // of my offer items; paging happens after that filter.
  const mine = opts.mine === "offer";
  const rows = await c.query(
    `SELECT r.id, r.list_id, COALESCE(NULLIF(btrim(v.short_name), ''), v.name) AS vendor_name, r.row_no, r.upc, r.sku, r.brand, r.description, r.size_text, r.case_pack, r.price_cents, r.match_status, r.suggestions, r.gender_override
       ${base} ORDER BY v.name, r.row_no ${mine ? "" : `LIMIT $${fp.length + 1} OFFSET $${fp.length + 2}`}`, mine ? fp : [...fp, opts.limit, opts.offset]);
  const total = mine ? null : await c.query<{ n: number }>(`SELECT count(*)::int AS n ${base}`, fp);
  const offerItems: OfferItem[] = mine ? (await c.query<OfferItem>(
    // my_desc: my own offer-list wording for the item (owner 2026-11-14: "showing my description name and la
    // esperanza description name … so i can verify they are matched correctly").
    `SELECT i.id, i.brand, i.name, i.size_ml::float8 AS size_ml, NULLIF(i.conc, '') AS conc, NULLIF(i.gender, '') AS gender, i.flags, i.display_name,
            string_agg(DISTINCT r.description, ' | ') AS my_desc
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
       JOIN perfume.items i ON i.id = r.item_id
      WHERE v.kind = 'offer' AND l.is_current AND l.voided_at IS NULL AND i.merged_into_id IS NULL
      GROUP BY i.id`)).rows : [];
  const myDesc = new Map(offerItems.map((o) => [o.id, (o as OfferItem & { my_desc?: string | null }).my_desc ?? null]));
  // The vendor's line split into the owner's columns: brand (canonical — CK → CALVIN KLEIN), model, size, type,
  // gender, tester/set, country, pieces per box, the vendor's code — the same reading the import engine used.
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const aliases = { ...BUILTIN_BRAND_ALIASES, ...Object.fromEntries(ba.rows.map((a) => [a.alias, a.brand])) };
  const out = rows.rows.map((r: Record<string, unknown>) => {
    const id = identify({ description: String(r.description ?? ""), brand: (r.brand as string | null) ?? null, size: (r.size_text as string | null) ?? null, gender: (r.gender_override as string | null) ?? null, brandAliases: aliases });
    const tail = vendorLineTail(String(r.description ?? ""));
    const base = { ...r, brand_name: id.brand || null, model: id.nameText || null, size_ml: id.sizeMl, conc: id.conc || null, gender: id.gender || null,
      flags: id.flags.join(" "), category: categoryOf(id.gender, id.flags), country: tail.country, case_pack: (r.case_pack as number | null) ?? tail.casePack, sku: (r.sku as string | null) ?? tail.code };
    if (!mine) return base;
    // My offer items first among the suggestions; the engine's own suggestions stay below them.
    const offer = offerCandidates({ description: String(r.description ?? ""), brand: (r.brand as string | null) ?? null }, id, offerItems);
    const engine = ((r.suggestions as Array<{ item_id: string }> | null) ?? []);
    // Only the strict offer candidates count as "my item" — the engine's old suggestions never do.
    const forMine = [...offer];
    return { ...base, suggestions: [...forMine, ...engine.filter((s) => !forMine.some((o) => o.item_id === s.item_id))], for_my_item: forMine[0] ? (forMine[0] as { display_name?: string }).display_name ?? null : null, for_my_desc: forMine[0] ? myDesc.get(forMine[0].item_id) ?? null : null, _mine: forMine.length > 0 };
  });
  if (!mine) return { rows: out, total: total!.rows[0].n };
  // Grouped by my item, then vendor, so the owner confirms item by item.
  type MineRow = Record<string, unknown> & { _mine?: boolean; for_my_item?: string | null; vendor_name?: unknown };
  const kept = (out as MineRow[]).filter((r) => r._mine)
    .sort((a, b) => String(a.for_my_item).localeCompare(String(b.for_my_item)) || String(a.vendor_name).localeCompare(String(b.vendor_name)))
    .map(({ _mine: _drop, ...rest }) => rest);
  return { rows: kept.slice(opts.offset, opts.offset + opts.limit), total: kept.length };
}

/**
 * Owner confirms a line: it IS this item (or a new item). Remembered as this vendor's spelling and SKU, attaches
 * the line's UPC to the item, and applies to every other unconfirmed line of that vendor with the same spelling or SKU.
 */
/** "Match my list ↔ competitor" (owner 2026-11-13/14): every item on my offer list with NO competitor line linked,
 *  my own wording and price, and the competitor lines it most likely is (likelyLines). Proposes only — the owner
 *  links each one with confirmRow. Counts are returned so the screen states how many are left. */
export async function myUnlinked(c: PoolClient): Promise<{ total_mine: number; linked: number; unlinked: number; rows: Array<{ item_id: string; display_name: string; my_desc: string | null; my_price_cents: number | null; candidates: LineCandidate[] }> }> {
  const offer = await c.query<OfferItem & { my_desc: string | null; my_price_cents: number | null }>(
    `SELECT i.id, i.brand, i.name, i.size_ml::float8 AS size_ml, NULLIF(i.conc, '') AS conc, NULLIF(i.gender, '') AS gender, i.flags, i.display_name,
            string_agg(DISTINCT r.description, ' | ') AS my_desc, min(r.price_cents)::int AS my_price_cents
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
       JOIN perfume.items i ON i.id = r.item_id
      WHERE v.kind = 'offer' AND l.is_current AND l.voided_at IS NULL AND i.merged_into_id IS NULL
      GROUP BY i.id`);
  const comp = await c.query<{ id: string; vendor: string; description: string; brand: string | null; size_text: string | null; gender_override: string | null; price_cents: number; item_id: string | null; linked_to: string | null }>(
    `SELECT r.id, COALESCE(NULLIF(btrim(v.short_name), ''), v.name) AS vendor, r.description, r.brand, r.size_text, r.gender_override,
            r.price_cents::int AS price_cents, r.item_id, i.display_name AS linked_to
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
       LEFT JOIN perfume.items i ON i.id = r.item_id
      WHERE v.kind IN ('sell', 'both') AND l.is_current AND l.voided_at IS NULL`);
  const linkedItems = new Set(comp.rows.map((r) => r.item_id).filter((x): x is string => Boolean(x)));
  const offerIds = new Set(offer.rows.map((o) => o.id));
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const aliases = { ...BUILTIN_BRAND_ALIASES, ...Object.fromEntries(ba.rows.map((a) => [a.alias, a.brand])) };
  // Lines already linked to an item on my list are spoken for; every other competitor line can be proposed
  // (unlinked, waiting in Review, or linked to an item that is not on my list — shown as "now linked to").
  const lines: CompetitorLine[] = comp.rows.filter((r) => !(r.item_id && offerIds.has(r.item_id))).map((r) => ({
    row_id: r.id, vendor: r.vendor, description: r.description, price_cents: r.price_cents, linked_to: r.linked_to,
    id: identify({ description: r.description, brand: r.brand, size: r.size_text, gender: r.gender_override, brandAliases: aliases }),
  }));
  const missing = offer.rows.filter((o) => !linkedItems.has(o.id));
  const rows = missing.map((o) => ({ item_id: o.id, display_name: o.display_name, my_desc: o.my_desc, my_price_cents: o.my_price_cents, candidates: likelyLines(o, lines) }))
    .sort((a, b) => (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0) || a.display_name.localeCompare(b.display_name));
  return { total_mine: offer.rows.length, linked: offer.rows.length - missing.length, unlinked: missing.length, rows };
}

export async function confirmRow(c: PoolClient, userId: string, rowId: string, target: { item_id?: string; create_new?: boolean }) {
  const row = (await c.query<{ id: string; list_id: string; vendor_id: string; upc: string | null; sku: string | null; brand: string | null; description: string; size_text: string | null; identity_key: string; loose_key: string; gender_override: string | null }>(
    `SELECT r.id, r.list_id, l.vendor_id, r.upc, r.sku, r.brand, r.description, r.size_text, r.identity_key, r.loose_key, r.gender_override
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id WHERE r.id = $1`, [rowId])).rows[0];
  if (!row) throw new Error("row_not_found");
  let itemId = target.item_id ?? null;
  if (!itemId && target.create_new) {
    const ix = await loadIndex(c);
    const m = matchLine(ix, row.vendor_id, { description: row.description, brand: row.brand, size_text: row.size_text, gender: row.gender_override }, { allowNewItem: false });
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

export type BulkAction =
  | { action: "confirm_best"; row_ids: string[] }
  | { action: "link_item"; row_ids: string[]; item_id: string }
  | { action: "create_new"; row_ids: string[] }
  | { action: "set_gender"; row_ids: string[]; gender: "M" | "W" | "U" };

/**
 * Owner 2026-11-12: "we need to have multiple selector to change gender or assign …". One action over many review
 * lines, all-or-nothing in one transaction (the route's). confirm_best / link_item / create_new reuse confirmRow, so a
 * bulk confirmation is exactly N single confirmations. set_gender stores the owner's gender on the line (the vendor's
 * text is never edited) and re-runs the engine on it: a line the engine can now identify links by itself.
 */
export async function bulkReview(c: PoolClient, userId: string, b: BulkAction) {
  const out = { rows: b.row_ids.length, linked: 0, items_created: 0, now_matched: 0, skipped: [] as Array<{ row_id: string; reason: string }> };
  if (b.action === "set_gender") {
    await c.query(`UPDATE perfume.price_list_rows SET gender_override = $2 WHERE id = ANY($1::uuid[]) AND match_status <> 'matched'`, [b.row_ids, b.gender]);
    const ix = await loadIndex(c);
    const rows = await c.query<{ id: string; vendor_id: string; upc: string | null; sku: string | null; brand: string | null; description: string; size_text: string | null }>(
      `SELECT r.id, l.vendor_id, r.upc, r.sku, r.brand, r.description, r.size_text FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
        WHERE r.id = ANY($1::uuid[]) AND r.match_status <> 'matched'`, [b.row_ids]);
    for (const r of rows.rows) {
      const m = matchLine(ix, r.vendor_id, { upc: r.upc, sku: r.sku, description: r.description, brand: r.brand, size_text: r.size_text, gender: b.gender }, { allowNewItem: false });
      if (m.itemId) {
        await c.query(`UPDATE perfume.price_list_rows SET item_id = $2, match_method = $3, match_status = 'matched', suggestions = '[]'::jsonb, identity_key = $4, loose_key = $5 WHERE id = $1`,
          [r.id, m.itemId, m.method, m.identity.key, looseKey(m.identity)]);
        out.now_matched++;
      } else {
        await c.query(`UPDATE perfume.price_list_rows SET match_status = $2, suggestions = $3::jsonb, identity_key = $4, loose_key = $5 WHERE id = $1`,
          [r.id, m.status, JSON.stringify(m.suggestions), m.identity.key, looseKey(m.identity)]);
      }
    }
    return out;
  }
  for (const id of b.row_ids) {
    let target: { item_id?: string; create_new?: boolean };
    if (b.action === "link_item") target = { item_id: b.item_id };
    else if (b.action === "create_new") target = { create_new: true };
    else {
      const r = (await c.query<{ match_status: string; suggestions: Array<{ item_id: string }> }>(`SELECT match_status, suggestions FROM perfume.price_list_rows WHERE id = $1`, [id])).rows[0];
      if (!r) { out.skipped.push({ row_id: id, reason: "row_not_found" }); continue; }
      if (r.match_status === "matched") continue; // already linked by an earlier row's spelling
      if (!r.suggestions?.[0]?.item_id) { out.skipped.push({ row_id: id, reason: "no_suggestion" }); continue; }
      target = { item_id: r.suggestions[0].item_id };
    }
    const already = (await c.query<{ match_status: string }>(`SELECT match_status FROM perfume.price_list_rows WHERE id = $1`, [id])).rows[0];
    if (!already) { out.skipped.push({ row_id: id, reason: "row_not_found" }); continue; }
    if (already.match_status === "matched") continue;
    try {
      const r = await confirmRow(c, userId, id, target);
      out.linked += r.rows_linked;
      if (target.create_new) out.items_created++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (reason === "item_needs_a_name") { out.skipped.push({ row_id: id, reason }); continue; }
      throw e;
    }
  }
  return out;
}

/**
 * Re-runs the engine on every line still waiting in Review (current lists): a line the engine can now identify
 * links by itself, and every other line gets fresh suggestions under today's rules. Run after the engine
 * improves or new lists bring new items. The vendor's text and the owner's gender corrections are kept.
 */
export async function rematchReview(c: PoolClient) {
  const ix = await loadIndex(c);
  const rows = await c.query<{ id: string; vendor_id: string; upc: string | null; sku: string | null; brand: string | null; description: string; size_text: string | null; gender_override: string | null }>(
    `SELECT r.id, l.vendor_id, r.upc, r.sku, r.brand, r.description, r.size_text, r.gender_override
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      WHERE r.match_status <> 'matched' AND l.is_current AND l.voided_at IS NULL`);
  const out = { lines: rows.rows.length, now_matched: 0, review: 0, unmatched: 0 };
  for (const r of rows.rows) {
    const m = matchLine(ix, r.vendor_id, { upc: r.upc, sku: r.sku, description: r.description, brand: r.brand, size_text: r.size_text, gender: r.gender_override }, { allowNewItem: false });
    if (m.itemId) {
      await c.query(`UPDATE perfume.price_list_rows SET item_id = $2, match_method = $3, match_status = 'matched', suggestions = '[]'::jsonb, identity_key = $4, loose_key = $5 WHERE id = $1`,
        [r.id, m.itemId, m.method, m.identity.key, looseKey(m.identity)]);
      out.now_matched++;
    } else {
      await c.query(`UPDATE perfume.price_list_rows SET match_status = $2, suggestions = $3::jsonb, identity_key = $4, loose_key = $5 WHERE id = $1`,
        [r.id, m.status, JSON.stringify(m.suggestions), m.identity.key, looseKey(m.identity)]);
      if (m.status === "review") out.review++; else out.unmatched++;
    }
  }
  return out;
}

export async function searchItems(c: PoolClient, q: string, limit = 25) {
  const s = q.trim();
  if (!s) return [];
  // Every word must appear somewhere in the item's name, in any order (owner 2026-11-12: "when searching for an
  // item it is not working" — "armani code" did not find "GIORGIO ARMANI · ARMANI CODE · …"). A digits-only
  // word also matches a UPC; the internal code still matches exactly.
  const words = s.toUpperCase().replace(/[^A-Z0-9.&' ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
  return (await c.query(
    `SELECT i.id, i.display_name, i.internal_code, (SELECT array_agg(u.upc) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs
       FROM perfume.items i
      WHERE i.merged_into_id IS NULL
        AND (i.internal_code = $1
             OR EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = i.id AND u.upc = ltrim(regexp_replace($1,'\\D','','g'),'0'))
             OR (cardinality($2::text[]) > 0 AND NOT EXISTS (SELECT 1 FROM unnest($2::text[]) w WHERE upper(i.display_name) NOT LIKE '%' || w || '%')))
      ORDER BY similarity(i.display_name, $1) DESC LIMIT $3`, [s, words, limit])).rows;
}

export async function setInternalCode(c: PoolClient, itemId: string, code: string | null) {
  await c.query(`UPDATE perfume.items SET internal_code = NULLIF(btrim($2), ''), updated_at = now() WHERE id = $1`, [itemId, code]);
}

/* ---------------- the grid ---------------- */

export type ColKind = "text" | "money" | "pct" | "int";
export type GridCol = { key: string; label: string; group: string; kind: ColKind };
export type GridView = "buy" | "trade" | "wholesale" | "comp" | "analysis" | "all";
export type GridRow = Record<string, string | number | null>;

/** The margin the owner types on the grid; when none is typed, the first saved wholesale target. */
export function targetPctOf(rules: DeskRules, typed: number | null | undefined): number {
  const t = typed ?? rules.wholesale_targets_pct[0] ?? 12;
  return Math.min(95, Math.max(0, t));
}

/** The % the owner believes his vendors earn; typed on the Trading tab, else the saved rule. */
export function earnPctOf(rules: DeskRules, typed: number | null | undefined): number {
  const t = typed ?? rules.vendor_earn_pct;
  return Math.min(95, Math.max(0, t));
}

/* ROUND 8.32 — CC-2 11-14: in-process caches; Level-1 per (data version, target, earn); Level-2 per (data version, view, mine, sort, dir). */
type GridPayload = { cols: GridCol[]; rows: GridRow[]; rules: DeskRules; vendors: VendorRow[]; target_pct: number; earn_pct: number; _vk: string };
/** Shared collator — avoids creating a new Intl.Collator on every localeCompare call (O(comparisons) → O(1) construction). */
const _col = new Intl.Collator("en", { numeric: true });
const _gridCache = new Map<string, GridPayload>();
/** Level-2 cache: pre-sorted filtered rows + zero-picks facets, one build per (data, view, mine, sort, dir). */
export type ViewPayload = { sorted: GridRow[]; facets0: Record<string, GridFacet[]> };
const _viewCache = new Map<string, ViewPayload>();
/** In-process version counter. Incremented on every write so cache hits skip the DB entirely.
 * On cold start or after invalidation the cache is empty anyway, so no seq scan is needed. */
let _gridVer = 0;
/** Clears both caches and bumps the version counter — write paths call this, so a warm HIT
 * never needs to query max(updated_at) from DB. */
export function invalidateGridCache(): void { _gridCache.clear(); _viewCache.clear(); _gridVer++; }

export async function buildGrid(c: PoolClient, opts: { targetPct?: number | null; earnPct?: number | null } = {}): Promise<GridPayload> {
  const _cacheKey = `v${_gridVer}|${opts.targetPct ?? "null"}|${opts.earnPct ?? "null"}`;
  const _cached = _gridCache.get(_cacheKey);
  if (_cached) return _cached;
  const rules = await getRules(c);
  const target = targetPctOf(rules, opts.targetPct);
  // Typed on the Trading tab: one % for every vendor. Not typed: each vendor's own saved %, else the rule.
  const earnTyped = opts.earnPct == null ? null : earnPctOf(rules, opts.earnPct);
  const vendors = await listVendors(c);
  const buyV = vendors.filter((v) => v.kind === "buy" || v.kind === "both");
  const sellV = vendors.filter((v) => v.kind === "sell" || v.kind === "both");
  // My own lists (owner 2026-11-12): my offer list to clients and my inventory (stock, quantities, last cost).
  // Never a supplier and never a competitor; each new upload replaces the last.
  const offerV = vendors.filter((v) => v.kind === "offer");
  const invV = vendors.filter((v) => v.kind === "inventory");
  const prices = await c.query<{ item_id: string; vendor_id: string; price_cents: number; qty: number | null; case_pack: number | null; sku: string | null; description: string;
    purchase_date: string | null; qty_purchased: number | null; qty_sold: number | null }>(
    // A vendor can have several current lists (full list + new arrivals). For each item the vendor's NEWEST
    // current list that carries it sets the price (list date, then import time); within that list, the lowest line.
    `SELECT DISTINCT ON (r.item_id, l.vendor_id) r.item_id, l.vendor_id, r.price_cents::int AS price_cents, r.qty, r.case_pack, r.sku, r.description,
            r.purchase_date::text AS purchase_date, r.qty_purchased, r.qty_sold
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      WHERE r.item_id IS NOT NULL AND l.is_current AND l.voided_at IS NULL
      ORDER BY r.item_id, l.vendor_id, l.list_date DESC, l.imported_at DESC, r.price_cents ASC`);
  const items = await c.query<{ id: string; internal_code: string | null; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; display_name: string; upcs: string[] | null }>(
    `SELECT i.id, i.internal_code, i.brand, i.name, i.size_ml::text, i.conc, i.gender, i.flags, i.display_name,
            (SELECT array_agg(u.upc ORDER BY u.created_at) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs
       FROM perfume.items i WHERE i.merged_into_id IS NULL`);
  const byItem = new Map<string, Map<string, { price: number; qty: number | null; case_pack: number | null; sku: string | null; country: string | null; desc: string;
    purchase_date: string | null; qty_purchased: number | null; qty_sold: number | null }>>();
  // Every current line's own text and SKU per item: the search reads them, so "CLUB DE NUIT" (the owner's list)
  // finds the item another vendor named "CDN" first (owner 2026-11-13: compare my Book 7 + Book 8 offer list).
  const lineText = new Map<string, Set<string>>();
  for (const p of prices.rows) {
    const t = lineText.get(p.item_id) ?? new Set<string>();
    t.add(String(p.description ?? "")); if (p.sku) t.add(p.sku);
    lineText.set(p.item_id, t);
    const m = byItem.get(p.item_id) ?? new Map();
    m.set(p.vendor_id, { price: p.price_cents, qty: p.qty, case_pack: p.case_pack, sku: p.sku, country: vendorLineTail(p.description).country, desc: String(p.description ?? ""),
      purchase_date: p.purchase_date, qty_purchased: p.qty_purchased, qty_sold: p.qty_sold });
    byItem.set(p.item_id, m);
  }
  const close = (v: number | null) => (v == null ? null : closeCents(v, rules.round_step, rules.round_dir));

  // Owner 2026-11-12: "my data on the left and their data should be one or two columns … you are adding too much."
  // No quantities, box counts, ranks or per-vendor freight anywhere in the grid.
  const cols: GridCol[] = [
    { key: "brand", label: "Brand", group: "Item", kind: "text" },
    { key: "name", label: "Name", group: "Item", kind: "text" },
    { key: "size_ml", label: "Size ml", group: "Item", kind: "int" },
    { key: "conc", label: "Type", group: "Item", kind: "text" },
    { key: "category", label: "Kind", group: "Item", kind: "text" },
    { key: "upc", label: "UPC", group: "Item", kind: "text" },
    // MINE — left of every vendor column.
    { key: "landed_likely", label: "My cost", group: "Mine", kind: "money" },
    { key: "best_vendor", label: "Buy from", group: "Mine", kind: "text" },
    { key: "target_price_margin", label: `My price @${target}%`, group: "Mine", kind: "money" },
    { key: "target_profit", label: `My profit @${target}%`, group: "Mine", kind: "money" },
    { key: "trade_beats", label: "My price beats their cost at", group: "Mine", kind: "text" },
    { key: "low_sell", label: "Lowest competitor", group: "Mine", kind: "money" },
    { key: "target_action", label: "Raise / lower", group: "Mine", kind: "text" },
  ];
  // My lists' columns appear only once that list is uploaded (no empty columns before the first upload).
  const hasInv = prices.rows.some((p) => invV.some((v) => v.id === p.vendor_id));
  const hasOffer = prices.rows.some((p) => offerV.some((v) => v.id === p.vendor_id));
  const mineCols: GridCol[] = [];
  // Owner 2026-11-14: "in purchase compare vendors i need … my last cost, date, quantity purchased, current inventory,
  // qty sold … the last price i purchased is important because prices change weekly". Stock comes from my inventory
  // file, else the quantities on my offer list ("you uploaded my price list and quantities").
  if (hasInv || hasOffer) mineCols.push({ key: "my_qty", label: hasInv ? "Inv qty" : "Inv qty (my list)", group: "Mine", kind: "int" });
  mineCols.push(
    { key: "my_last_cost", label: "My last cost", group: "Mine", kind: "money" },
    { key: "my_purchase_date", label: "Purchase date", group: "Mine", kind: "text" },
    { key: "my_qty_purchased", label: "Qty purchased", group: "Mine", kind: "int" },
    { key: "my_qty_sold", label: "Qty sold", group: "Mine", kind: "int" },
  );
  if (hasOffer) mineCols.push(
    { key: "my_offer_desc", label: "My description", group: "Mine", kind: "text" },
    { key: "my_offer_price", label: "My offer price", group: "Mine", kind: "money" },
    { key: "offer_vs_low", label: "Offer vs lowest", group: "Mine", kind: "money" },
    { key: "offer_action", label: "My offer: raise / lower", group: "Mine", kind: "text" },
    { key: "offer_margin_pct", label: "My offer margin %", group: "Mine", kind: "pct" },
    { key: "my_need", label: "Need to buy", group: "Mine", kind: "int" },
  );
  cols.splice(cols.findIndex((c) => c.group === "Mine"), 0, ...mineCols);
  // PURCHASE — one column per supplier: its price.
  // Owner 2026-11-12: "in purchase … I just need their list price and the price after the cushion."
  for (const v of buyV) {
    cols.push({ key: `v:${v.id}:price`, label: "List price", group: vendorLabel(v), kind: "money" });
    cols.push({ key: `v:${v.id}:net`, label: "Cushion", group: vendorLabel(v), kind: "money" });
  }
  // TRADING — two columns per supplier: their price, and their cost = (their price − cushion) less the % they earn.
  for (const v of buyV) {
    // Owner 2026-11-12: "the data from each vendor should only really be the price of the vendor's list, the approx
    // profit they earn and the price I approximately need to sell to them."
    cols.push({ key: `t:${v.id}:list`, label: "Their list price", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
    cols.push({ key: `t:${v.id}:earn`, label: "They earn ≈", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
    cols.push({ key: `t:${v.id}:cost`, label: "Sell to them ≈", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
  }
  // WHOLESALE — per competitor (owner 2026-11-14): their description (to check the match against mine), their list
  // price, the cushion (tiers: .25 / .50 over $10 / 1.00 over $30), their real price (list − cushion), and my offer
  // price against that real price: over/under $ and %, and the % to reduce (or room to raise) my price.
  for (const v of sellV) {
    const g = `Competitor · ${vendorLabel(v)}`;
    cols.push({ key: `s:${v.id}:desc`, label: "Their description", group: g, kind: "text" });
    cols.push({ key: `s:${v.id}:price`, label: "List price", group: g, kind: "money" });
    cols.push({ key: `s:${v.id}:cushion`, label: "Cushion", group: g, kind: "money" });
    cols.push({ key: `s:${v.id}:real`, label: "Real price", group: g, kind: "money" });
    cols.push({ key: `s:${v.id}:diff`, label: "Me vs real $", group: g, kind: "money" });
    cols.push({ key: `s:${v.id}:diff_pct`, label: "Me vs real %", group: g, kind: "pct" });
    cols.push({ key: `s:${v.id}:action`, label: "Reduce / raise", group: g, kind: "text" });
  }
  // COMPETITION MARGIN — owner 2026-11-12: "a tab … an engine, check the margin of the competition if purchasing from
  // the same vendors, the lowest cost vendors … the vendors' prices − the cushion (.25 under $10, .50 over $10, 1.00
  // over $30) … so I can measure their margin." Their cost ≈ cheapest supplier list price − that tiered cushion.
  cols.push(
    { key: "comp_low_vendor", label: "Cheapest supplier", group: "Their cost", kind: "text" },
    { key: "comp_low_list", label: "List price", group: "Their cost", kind: "money" },
    { key: "comp_cushion", label: "Cushion", group: "Their cost", kind: "money" },
    { key: "comp_cost", label: "Their cost ≈", group: "Their cost", kind: "money" },
  );
  for (const v of sellV) {
    const g = `Margin · ${vendorLabel(v)}`;
    cols.push({ key: `c:${v.id}:price`, label: "Their price", group: g, kind: "money" });
    cols.push({ key: `c:${v.id}:earn`, label: "They earn", group: g, kind: "money" });
    cols.push({ key: `c:${v.id}:margin`, label: "Margin %", group: g, kind: "pct" });
  }

  // LIST ANALYSIS columns — the owner's format, his groups and headers in his order.
  const minMargin = opts.targetPct ?? 15;
  const cGroup = `COMPETITOR · ${sellV.length === 1 ? vendorLabel(sellV[0]) : "lowest sales price"}`;
  const A = (key: string, label: string, group: string, kind: GridCol["kind"]): GridCol => ({ key: `a:${key}`, label, group, kind });
  cols.push(
    A("upc", "UPC", "ITEM", "text"), A("sku", "SKU", "ITEM", "text"), A("brand", "BRAND", "ITEM", "text"), A("name", "NAME", "ITEM", "text"),
    A("size", "SIZE", "ITEM", "int"), A("type", "TYPE", "ITEM", "text"), A("kind", "KIND", "ITEM", "text"),
    A("purch_date", "PURCH DATE", "SALES", "text"), A("qty", "QTY", "SALES", "int"), A("last_cost", "LAST COST", "SALES", "money"),
    A("sold", "SOLD", "SALES", "int"), A("inv_qty", "Inv Qty", "SALES", "int"), A("margin", "Margin", "SALES", "pct"), A("markup", "Markup", "SALES", "pct"),
    A("offer", "OFFER PRICE", "SALES", "money"), A("esp", "Esperanza Price", "SALES", "money"), A("low_sales", "Lowest Sales Price", "SALES", "money"),
    A("min_buy", "Min Purchase Price to match la esperanza", "Purchases", "money"), A("min_margin", "Min Margin", "Purchases", "pct"),
    A("low_vendor", "Lowest Vendor", "Purchases", "text"), A("low_price", "Lowest Price", "Purchases", "money"),
    A("offer2", "OFFER PRICE", "Analysis", "money"), A("esp2", "Esperanza Price", "Analysis", "money"), A("under_by", "Under By", "Analysis", "money"),
    A("under_pct", "Under %", "Analysis", "pct"), A("can_inc", "Can Increase %", "Analysis", "pct"), A("new_margin", "New Margin.", "Analysis", "pct"),
    A("over_by", "Over By", "Analysis", "money"), A("lower_pct", "Lower % to Match", "Analysis", "pct"),
    A("c_list", "LIST PRICE", cGroup, "money"), A("c_cushion", "CUSHION", cGroup, "money"), A("c_sales", "SALES PRICE", cGroup, "money"),
    A("my_desc", "My description", "Check the match", "text"), A("c_desc", "Their description", "Check the match", "text"),
  );
  const vName = new Map(vendors.map((v) => [v.id, vendorLabel(v)]));
  const rows: GridRow[] = [];
  for (const it of items.rows) {
    const offersMap = byItem.get(it.id) ?? new Map();
    const row: GridRow = {
      id: it.id, code: it.internal_code, upc: it.upcs?.[0] ?? null, upc_count: it.upcs?.length ?? 0, brand: it.brand, name: it.name,
      size_ml: it.size_ml == null ? null : Number(it.size_ml), conc: it.conc, gender: it.gender, category: categoryOf(it.gender, it.flags), flags: it.flags.join(" "), display_name: it.display_name,
      upcs: (it.upcs ?? []).join(" "),
      line_text: [...(lineText.get(it.id) ?? [])].join(" | "),
    };
    const offers = buyV.filter((v) => offersMap.has(v.id)).map((v) => ({
      vendorId: v.id, listedCents: offersMap.get(v.id)!.price,
      cushionLoCents: v.cushion_lo_cents ?? rules.cushion_lo_cents, cushionHiCents: v.cushion_hi_cents ?? rules.cushion_hi_cents,
      freightLoCents: v.freight_lo_cents ?? rules.freight_lo_cents, freightHiCents: v.freight_hi_cents ?? rules.freight_hi_cents,
    }));
    const ranked = rankOffers(offers);
    for (const o of ranked) {
      row[`v:${o.vendorId}:price`] = o.listedCents;
      row[`v:${o.vendorId}:net`] = Math.max(0, o.listedCents - o.cushionLoCents);
    }
    const best = ranked[0];
    if (best) {
      const winners = ranked.filter((o) => o.rank === 1);
      row.best_vendor = winners.map((o) => vName.get(o.vendorId)).join(" | ");
      row.n_vendors = ranked.length;
      row.landed_likely = best.likelyCents;
    } else {
      row.n_vendors = 0;
    }
    // My lists: stock and last cost from my inventory, my offer price (and the qty I offer) from my offer list.
    let myQty: number | null = null, myCost: number | null = null, myOffer: number | null = null, offerQty: number | null = null;
    let myPurch: string | null = null, myQtyPurch: number | null = null, mySold: number | null = null, mySku: string | null = null;
    for (const v of invV) { const o = offersMap.get(v.id); if (o) { myQty = (myQty ?? 0) + (o.qty ?? 0); myCost = myCost ?? o.price; myPurch = myPurch ?? o.purchase_date; myQtyPurch = myQtyPurch ?? o.qty_purchased; mySold = mySold ?? o.qty_sold; mySku = mySku ?? o.sku; } }
    let myOfferDesc: string | null = null;
    for (const v of offerV) { const o = offersMap.get(v.id); if (o) { myOffer = myOffer ?? o.price; myOfferDesc = myOfferDesc ?? o.desc; offerQty = o.qty ?? offerQty; mySku = mySku ?? o.sku; } }
    const invUploaded = invV.some((v) => offersMap.has(v.id));
    // No inventory file yet: the quantity on my offer list IS my stock (owner 2026-11-14). Never a guessed number.
    if (!invUploaded && offerQty != null) myQty = offerQty;
    row.my_offer_desc = myOfferDesc;
    row.my_purchase_date = myPurch;
    row.my_qty_purchased = myQtyPurch;
    row.my_qty_sold = mySold;
    row.my_sku = mySku;
    row.my_qty = myQty;
    row.my_last_cost = myCost;
    row.my_offer_price = myOffer;
    row.in_offer = myOffer != null ? 1 : 0;
    row.in_inventory = myQty != null ? 1 : 0;
    // Need to buy: on my offer list and short in stock — only when a real inventory file exists (owner 2026-11-14:
    // no purchase quantities are recommended without stock data).
    row.my_need = myOffer != null && invUploaded ? Math.max(0, (offerQty ?? 1) - (myQty ?? 0)) : null;
    let low: number | null = null, lowAt: string | null = null;
    // What a competitor most likely pays: the cheapest supplier list price for the item, less the tiered cushion.
    let lowList: number | null = null, lowListAt: string | null = null;
    for (const v of buyV) { const p = offersMap.get(v.id)?.price; if (p != null && (lowList == null || p < lowList)) { lowList = p; lowListAt = vendorLabel(v); } }
    const compCushion = lowList == null ? null : Math.min(lowList, tieredCushionCents(lowList, rules.competitor_cushion_tiers));
    const compCost = lowList == null ? null : lowList - (compCushion ?? 0);
    row.comp_low_vendor = lowListAt; row.comp_low_list = lowList; row.comp_cushion = compCushion; row.comp_cost = compCost;
    for (const v of sellV) {
      const p = offersMap.get(v.id)?.price;
      if (p == null) continue;
      row[`s:${v.id}:price`] = p;
      row[`s:${v.id}:desc`] = offersMap.get(v.id)?.desc ?? null;
      const cushion = Math.min(p, tieredCushionCents(p, rules.competitor_cushion_tiers));
      const real = p - cushion;
      row[`s:${v.id}:cushion`] = cushion;
      row[`s:${v.id}:real`] = real;
      const cmp = myOffer != null ? offerVsReal(myOffer, real) : null;
      row[`s:${v.id}:diff`] = cmp?.diffCents ?? null;
      row[`s:${v.id}:diff_pct`] = cmp?.diffPct ?? null;
      row[`s:${v.id}:action`] = cmp?.action ?? null;
      row[`c:${v.id}:price`] = p;
      if (compCost != null) {
        row[`c:${v.id}:earn`] = p - compCost;
        row[`c:${v.id}:margin`] = p > 0 ? Math.round(((p - compCost) / p) * 1000) / 10 : null;
      }
      if (low == null || p < low) { low = p; lowAt = vendorLabel(v); }
    }
    row.low_sell = low;
    row.low_sell_vendor = lowAt;
    // LIST ANALYSIS — the owner's own format (11-14-2026 PERFUME_ENGINE_FORMATS.xlsx), his formulas, cell for cell:
    //  Margin = (offer − last cost) ÷ offer · Markup = (offer − last cost) ÷ last cost · Esperanza price = their SALES
    //  price (list − cushion) · Lowest sales price = min(offer, Esperanza) · Min purchase price = Esperanza × (1 − min
    //  margin) · Under by = Esperanza − offer when I am under · Under % = under ÷ Esperanza · Can increase % = under ÷
    //  offer · New margin = (Esperanza − last cost) ÷ Esperanza · Over by = offer − Esperanza · Lower % = over ÷ offer.
    //  The competitor is the one with the lowest SALES price. Blank stays blank — never a guessed cost or date.
    let cBest: { list: number; cushion: number; real: number; desc: string | null } | null = null;
    for (const v of sellV) {
      const real = row[`s:${v.id}:real`] as number | undefined;
      if (real == null) continue;
      if (!cBest || real < cBest.real) cBest = { list: row[`s:${v.id}:price`] as number, cushion: row[`s:${v.id}:cushion`] as number, real, desc: (row[`s:${v.id}:desc`] as string | null) ?? null };
    }
    const p1 = (x: number) => Math.round(x * 1000) / 10;
    const esp = cBest?.real ?? null;
    const both = myOffer != null && esp != null;
    const under = both ? (myOffer! < esp! ? esp! - myOffer! : 0) : null;
    const over = both ? (myOffer! > esp! ? myOffer! - esp! : 0) : null;
    Object.assign(row, {
      "a:upc": row.upc, "a:sku": mySku, "a:brand": it.brand, "a:name": it.name, "a:size": row.size_ml, "a:type": it.conc || null,
      "a:kind": ({ M: "Men", W: "Women", U: "Unisex" } as Record<string, string>)[it.gender] ?? null,
      "a:purch_date": myPurch, "a:qty": myQtyPurch, "a:last_cost": myCost, "a:sold": mySold, "a:inv_qty": myQty,
      "a:margin": myOffer != null && myOffer > 0 && myCost != null ? p1((myOffer - myCost) / myOffer) : null,
      "a:markup": myOffer != null && myCost ? p1((myOffer - myCost) / myCost) : null,
      "a:offer": myOffer, "a:esp": esp,
      "a:low_sales": myOffer == null && esp == null ? null : Math.min(...[myOffer, esp].filter((x): x is number => x != null)),
      "a:min_buy": esp != null ? Math.round(esp * (1 - minMargin / 100)) : null, "a:min_margin": minMargin,
      "a:low_vendor": lowListAt, "a:low_price": lowList,
      "a:offer2": myOffer, "a:esp2": esp,
      "a:under_by": under, "a:under_pct": under != null && esp! > 0 ? p1(under / esp!) : null,
      "a:can_inc": under != null && myOffer! > 0 ? p1(under / myOffer!) : null,
      "a:new_margin": esp != null && esp > 0 && myCost != null ? p1((esp - myCost) / esp) : null,
      "a:over_by": over, "a:lower_pct": over != null && myOffer! > 0 ? p1(over / myOffer!) : null,
      "a:c_list": cBest?.list ?? null, "a:c_cushion": cBest?.cushion ?? null, "a:c_sales": esp,
      "a:my_desc": myOfferDesc, "a:c_desc": cBest?.desc ?? null,
    });
    // My offer price against the lowest competitor (owner 2026-11-13: "my wholesale prices … compare in wholesale and
    // with other vendors"). Positive gap = my offer is under the cheapest competitor.
    // The margin my offer price already carries (owner 2026-11-13: "my list already has margin … 6 percent"):
    // (offer − my cost) ÷ offer, my cost = my inventory's last cost, else the cheapest supplier landed cost.
    // Measured, never assumed — no margin is added on top of my offer price anywhere.
    // Owner 2026-11-14: "where are you getting my cost from? i never uploaded my current cost." Only my inventory's
    // last cost counts as my cost — never a supplier price standing in for it.
    row.offer_margin_pct = myOffer != null && myOffer > 0 && myCost != null ? Math.round(((myOffer - myCost) / myOffer) * 1000) / 10 : null;
    if (myOffer != null && low != null) {
      row.offer_vs_low = low - myOffer;
      row.offer_action = wholesaleAction(low - myOffer);
    } else {
      row.offer_vs_low = null;
      row.offer_action = myOffer != null ? "No competitor carries it" : null;
    }
    const cost = (row.landed_likely as number | null) ?? null;
    if (cost != null) {
      row.target_price_margin = close(priceFromCost(cost, target, "margin"));
      row.target_profit = (row.target_price_margin as number) - cost;
      if (low != null) {
        const gap = low - (row.target_price_margin as number);
        row.target_vs_low = gap;
        row.target_action = wholesaleAction(gap);
      }
    }
    // TRADING: each supplier's cost = (their price − their cushion) less the % they earn. My price beats it when it is
    // at or under their cost (owner 2026-11-12: "their list price, and the cushion and then their margin … compare
    // their cost so I can see if my offer is good enough").
    const beats: string[] = [];
    for (const v of buyV) {
      const theirs = offersMap.get(v.id)?.price;
      if (theirs == null) continue;
      const earn = earnTyped ?? (v.earn_pct == null ? rules.vendor_earn_pct : Number(v.earn_pct));
      const cushion = v.cushion_hi_cents ?? rules.cushion_hi_cents;
      const theirCost = Math.round(costFromPrice(Math.max(0, theirs - cushion), earn, "margin"));
      row[`t:${v.id}:list`] = theirs;
      row[`t:${v.id}:cost`] = theirCost;
      // What they make on it: their list price less the cushion they give, less what they pay (= what I sell at).
      row[`t:${v.id}:earn`] = Math.max(0, theirs - cushion) - theirCost;
      const mine = row.target_price_margin as number | undefined;
      if (mine != null && mine <= theirCost) beats.push(vendorLabel(v));
    }
    row.trade_beats = beats.length ? beats.join(", ") : null;
    if (low != null) row.target_max_cost = costFromPrice(low, target, "margin");
    // Every vendor (buy or Laredo store) that has a price for this item — the Vendor filter reads it; not a column.
    row.carried_by = [...buyV, ...sellV].filter((v) => row[`v:${v.id}:price`] != null || row[`s:${v.id}:price`] != null).map((v) => v.name).join("\n");
    rows.push(row);
  }
  const _result: GridPayload = { cols, rows, rules, vendors, target_pct: target, earn_pct: earnTyped ?? rules.vendor_earn_pct, _vk: _cacheKey };
  _gridCache.set(_cacheKey, _result);
  return _result;
}

/** Level-2 view cache: sorted+filtered rows + zero-picks facets cached per (data version, view, mine, sort, dir).
 *  After a cache hit, per-request work is: searchRows (if q) + filterFacets (if picks) + slice only. */
export function getOrBuildView(
  g: GridPayload,
  view: GridView,
  mine: MineFilter | undefined,
  sort: string | undefined,
  dir: "asc" | "desc",
): ViewPayload {
  const key = `${g._vk}|${g.target_pct}|${g.earn_pct}|${view}|${mine ?? ""}|${sort ?? ""}|${dir}`;
  const hit = _viewCache.get(key);
  if (hit) return hit;
  const baseRows = filterView(filterMine(g.rows, mine), view, mine);
  const sorted = sort ? sortRows(baseRows, sort, dir) : baseRows;
  const facets0 = gridFacets(sorted, { category: [], gender: [], brand: [], size: [], vendor: [] });
  const vp: ViewPayload = { sorted, facets0 };
  _viewCache.set(key, vp);
  return vp;
}

/** Wholesale: positive gap = my price is under the lowest competitor (room to raise); negative = I am over it. */
/** My offer price against a competitor's real price (list − cushion). diff > 0 = I am over them.
 *  diffPct = diff ÷ their real price; the action gives the % to cut MY price to meet theirs (or the room to raise). */
export function offerVsReal(myOfferCents: number, realCents: number): { diffCents: number; diffPct: number | null; action: string } {
  const diff = myOfferCents - realCents;
  const d = (Math.abs(diff) / 100).toFixed(2);
  const diffPct = realCents > 0 ? Math.round((diff / realCents) * 1000) / 10 : null;
  const ofMine = myOfferCents > 0 ? (Math.round((Math.abs(diff) / myOfferCents) * 1000) / 10).toFixed(1) : null;
  const pctTxt = diffPct == null ? "" : ` (${Math.abs(diffPct).toFixed(1)}%)`;
  if (diff > 0) return { diffCents: diff, diffPct, action: `Over by $${d}${pctTxt} — reduce${ofMine ? ` ${ofMine}%` : ""}` };
  if (diff < 0) return { diffCents: diff, diffPct, action: `Under by $${d}${pctTxt} — room to raise${ofMine ? ` ${ofMine}%` : ""}` };
  return { diffCents: 0, diffPct: 0, action: "Same as their real price" };
}

export function wholesaleAction(gapCents: number): string {
  const d = (Math.abs(gapCents) / 100).toFixed(2);
  if (gapCents > 0) return `Under by $${d} — can raise`;
  if (gapCents < 0) return `Over by $${d} — lower to compete`;
  return "Same as lowest competitor";
}

function round1(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}

function buyPriced(r: GridRow): boolean {
  return Object.keys(r).some((k) => k.startsWith("t:") && k.endsWith(":list") && r[k] != null);
}

/** Owner 2026-11-12: "a selector that will only show items from my list that I offer or from my needs list". */
export type MineFilter = "offer" | "inventory" | "need";
export function filterMine(rows: GridRow[], mine: MineFilter | undefined): GridRow[] {
  if (mine === "offer") return rows.filter((r) => r.in_offer === 1);
  if (mine === "inventory") return rows.filter((r) => r.in_inventory === 1);
  if (mine === "need") return rows.filter((r) => Number(r.my_need ?? 0) > 0);
  return rows;
}

/** Each tab shows only the items it can price. When the owner narrows to HIS OWN list (mine = offer / inventory /
 *  need), every item on that list stays: a blank supplier or competitor cell then says "nobody carries it", which is
 *  the answer he is looking for (owner 2026-11-13: 463 offer items, only 95 shown because 368 had no competitor). */
export function filterView(rows: GridRow[], view: GridView, mine?: MineFilter): GridRow[] {
  if (mine) return rows;
  if (view === "buy") return rows.filter((r) => (r.n_vendors as number) > 0);
  if (view === "trade") return rows.filter((r) => buyPriced(r));
  if (view === "wholesale") return rows.filter((r) => r.low_sell != null && (r.landed_likely != null || r.my_offer_price != null));
  if (view === "comp") return rows.filter((r) => r.comp_cost != null && r.low_sell != null);
  // List analysis is of MY list: items on my offer list or in my inventory.
  if (view === "analysis") return rows.filter((r) => r.in_offer === 1 || r.in_inventory === 1);
  return rows;
}

/** Every typed word must appear, in any order, in the item's code, UPCs, brand, name, or the text of any current
 *  vendor line for it (so the owner's own wording finds the item). A 6+ digit query also matches a UPC. */
export function searchRows(rows: GridRow[], q: string): GridRow[] {
  const s = stripAccentsLite(q).trim().toUpperCase();
  if (!s) return rows;
  const digits = s.replace(/\D/g, "").replace(/^0+/, "");
  const words = s.replace(/[^A-Z0-9.&' ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
  return rows.filter((r) => {
    if (digits.length >= 6 && /^[\d\s-]+$/.test(s) && String(r.upcs ?? "").includes(digits)) return true;
    const hay = stripAccentsLite(`${r.code ?? ""} ${r.upcs ?? ""} ${r.sku ?? ""} ${r.brand ?? ""} ${r.name ?? ""} ${r.display_name ?? ""} ${r.line_text ?? ""}`).toUpperCase();
    return words.length > 0 && words.every((w) => hay.includes(w));
  });
}

function stripAccentsLite(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export type FacetPicks = { category: string[]; gender: string[]; brand: string[]; size?: string[]; vendor?: string[] };
const FACET_KEYS = ["category", "gender", "brand", "size", "vendor"] as const;
type FacetKey = (typeof FACET_KEYS)[number];

export function splitPicks(v: string): string[] {
  return [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))];
}

/** A row's values for one facet. Vendor is many-valued: every vendor that prices the item. */
function facetValues(r: GridRow, k: FacetKey): string[] {
  if (k === "vendor") { const v = String(r.carried_by ?? ""); return v ? v.split("\n") : ["—"]; }
  if (k === "size") return [r.size_ml == null || r.size_ml === "" ? "—" : String(r.size_ml)];
  return [String(r[k] ?? "").trim() || "—"];
}

/** Keeps rows whose type, gender, brand, size and vendor each match the picks; an empty pick list means all.
 *  Vendor: the item is carried by ANY picked vendor. */
export function filterFacets(rows: GridRow[], picks: FacetPicks): GridRow[] {
  const sets = FACET_KEYS.filter((k) => (picks[k] ?? []).length > 0).map((k) => [k, new Set(picks[k])] as const);
  if (sets.length === 0) return rows;
  return rows.filter((r) => sets.every(([k, set]) => facetValues(r, k).some((v) => set.has(v))));
}

export type GridFacet = { value: string; count: number };

/** Each facet's options with counts, measured against the other two facets' picks (so the counts always add up to
 *  what the grid would show), sorted A→Z with "—" (blank) last. */
export function gridFacets(rows: GridRow[], picks: FacetPicks): Record<FacetKey, GridFacet[]> {
  const out = {} as Record<FacetKey, GridFacet[]>;
  for (const k of FACET_KEYS) {
    const scoped = filterFacets(rows, { ...picks, [k]: [] });
    const counts = new Map<string, number>();
    for (const r of scoped) for (const v of facetValues(r, k)) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const v of picks[k] ?? []) if (!counts.has(v)) counts.set(v, 0);
    out[k] = [...counts].map(([value, count]) => ({ value, count }))
      .sort((a, b) => (a.value === "—" ? 1 : b.value === "—" ? -1 : _col.compare(a.value, b.value)));
  }
  return out;
}

/** Sort any column ascending or descending; empty cells always last; text compares A→Z, numbers numerically. */
export function sortRows(rows: GridRow[], key: string, dir: "asc" | "desc"): GridRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = a[key], y = b[key];
    const xe = x == null || x === "", ye = y == null || y === "";
    if (xe && ye) return byBrandName(a, b);
    if (xe) return 1;
    if (ye) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : _col.compare(String(x), String(y));
    return c === 0 ? byBrandName(a, b) : c * sign;
  });
}

/** The standing tie-break under every sort: brand, then name, then size, then the full display name. */
function byBrandName(a: GridRow, b: GridRow): number {
  const t = (x: unknown) => String(x ?? "");
  return _col.compare(t(a.brand), t(b.brand))
    || _col.compare(t(a.name), t(b.name))
    || (Number(a.size_ml ?? 0) - Number(b.size_ml ?? 0))
    || _col.compare(t(a.display_name), t(b.display_name));
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
    ["My cost", "Vendor price − low cushion + high freight (the safe number: the smaller discount and the larger freight)"],
    ["Purchase · Cushion", "List price − the cushion that vendor gives (its own, else the rule's low cushion)"],
    ["Competition · Their cost ≈", "Cheapest supplier list price − the cushion tier ($10 and under: $0.25, over $10: $0.50, over $30: $1.00 — set in Rules)"],
    ["Competition · They earn / Margin %", "Competitor's price − Their cost ≈; Margin % = that ÷ the competitor's price"],
    ["Trading · They earn ≈", "(Their list price − their cushion) − Sell to them ≈ — what that supplier makes on it"],
    ["Trading · Sell to them ≈", "(Their list price − their cushion) × (1 − the % they earn) — about what that supplier pays, so the most I can sell to them at"],
    ["Mine · My price beats their cost at", "Suppliers whose cost is at or above my price at X% — my offer is good enough for them"],
    ["Mine · Raise / lower", "Lowest competitor − my price at X%: positive = room to raise, negative = lower to compete"],
    ["Sell at X% margin", "My cost ÷ (1 − X%) — X is the margin typed on the grid"],
    ["Sell at X% markup", "My cost × (1 + X%)"],
    ["Profit at X% margin", "Sell at X% margin − my cost"],
    ["Most I can pay for X%", "Lowest Laredo list price × (1 − X%) — buy at or under this to still earn X% at Laredo's low price"],
    ["Laredo low − my X% price", "Positive = my X% price is under the lowest Laredo price"],
    ["Closed numbers", `Every computed price rounds ${rules.round_dir} to ${rules.round_step === "75" ? "a price ending in .75" : `$${(Number(rules.round_step) / 100).toFixed(2)}`}`],
    ["Default cushion", `$${(rules.cushion_lo_cents / 100).toFixed(2)} – $${(rules.cushion_hi_cents / 100).toFixed(2)} (each vendor can override)`],
    ["Default freight", `$${(rules.freight_lo_cents / 100).toFixed(2)} – $${(rules.freight_hi_cents / 100).toFixed(2)} per piece`],
  ]) how.addRow(line);
  how.getColumn(1).width = 26; how.getColumn(2).width = 80;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
