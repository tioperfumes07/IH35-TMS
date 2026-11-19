/**
 * PERFUME-DESK service — the only writer of perfume.*. Owner-only (RLS + route guard). Never touches a
 * carrier table and never posts to the GL. Every amount is integer cents.
 */
import type { PoolClient } from "pg";
import ExcelJS from "exceljs";
import { addItem, compactKey, displayNameOf, emptyIndex, matchLine, productKind, similarity, suggest, type LineIn, type MatchIndex } from "./matching.js";
import { BUILTIN_BRAND_ALIASES, canonicalBrand, categoryOf, identify, nameBrandIndex, setDeskBrands, setNameBrands, looseKey, normalizeUpc, vendorLineTail, type Identity } from "./normalize.js";
import { lineGender, offerCandidates, type OfferItem } from "./offer-review.js";
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
/** Owner 2026-11-16 16:31 CT: "the order of vendors is ok in alphabetical order but the first ones should always be, pca, mtz,
 *  elegance, mr distributors, then the rest in alphabetical order." By the vendor's short name (its column header). */
// Owner 2026-11-16 17:41 CT: Elegance's ARABIC list is its own list, kept next to Elegance (as PPW BLK FRI sits by PPW).
export const VENDOR_FIRST = ["PCA", "MTZ", "ELEGANCE", "ELEGANCE ARB", "M&R DIST"];
export function orderVendors<V extends { name: string; short_name: string | null }>(vs: readonly V[]): V[] {
  const rank = (v: V) => { const i = VENDOR_FIRST.indexOf((v.short_name ?? "").trim().toUpperCase()); return i < 0 ? VENDOR_FIRST.length : i; };
  const label = (v: V) => (v.short_name?.trim() || v.name).toLowerCase();
  return [...vs].sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
export async function listVendors(c: PoolClient): Promise<VendorRow[]> {
  return orderVendors((await c.query<VendorRow>(
    `SELECT id, name, short_name, kind, cushion_lo_cents, cushion_hi_cents, freight_lo_cents, freight_hi_cents, earn_pct::text, sells_by_box, contact, column_mapping
       FROM perfume.vendors WHERE archived_at IS NULL ORDER BY lower(name)`,
  )).rows);
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

/**
 * Re-derive every item's KEY (brand + name part) with the CURRENT reading rules. An item's identity_key is written
 * once, when the item is made; when a rule improves (a trailing house "IDOLE LANCOME", "LOVE&LUCK", HALLOWEEN as the
 * JESUS DEL POZO line — measured live 11-15) the stored key keeps the old reading and the vendor line that now reads
 * right still misses it. Size / type / gender / flags parts are kept exactly as stored. dryRun reports what WOULD
 * change (with samples) and writes nothing; a real run renames, and merges an item into an existing twin whose key it
 * now equals (UPCs, aliases and price lines move to the twin — the same merge canonicalizeItemBrands performs).
 */
export async function rekeyItems(c: PoolClient, opts: { dryRun: boolean }): Promise<{
  checked: number; changed: number; renamed: number; merged: number; dry_run: boolean;
  samples: Array<{ id: string; from: string; to: string; merge_into: string | null }>;
}> {
  await loadNameBrands(c);
  const aliases = Object.fromEntries((await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`)).rows.map((r) => [r.alias, r.brand]));
  const items = (await c.query<{ id: string; brand: string; name: string; identity_key: string; display_name: string }>(
    `SELECT id, brand, name, identity_key, display_name FROM perfume.items WHERE merged_into_id IS NULL ORDER BY created_at, id`)).rows;
  const byKey = new Map<string, string>();
  for (const it of items) byKey.set(it.identity_key, it.id);
  let changed = 0, renamed = 0, merged = 0;
  const samples: Array<{ id: string; from: string; to: string; merge_into: string | null }> = [];
  for (const it of items) {
    const parts = it.identity_key.split("|");
    if (parts.length < 6 || !it.name) continue;
    const id = identify({ brand: it.brand || null, description: it.name, brandAliases: aliases });
    const brand = id.brand || canonicalBrand(it.brand, aliases) || parts[0]!;
    const name = id.nameWords.join(" ");
    if (!name && parts[1]) continue; // a reading that loses the whole name is never applied
    if (brand === parts[0] && name === parts[1]) continue;
    const next = [brand, name, ...parts.slice(2)].join("|");
    const holder = byKey.get(next);
    const mergeInto = holder && holder !== it.id ? holder : null;
    changed++;
    if (samples.length < 80) samples.push({ id: it.id, from: it.identity_key, to: next, merge_into: mergeInto });
    if (opts.dryRun) continue;
    if (mergeInto) {
      await c.query(`UPDATE perfume.items SET merged_into_id = $2, updated_at = now() WHERE id = $1`, [it.id, mergeInto]);
      await c.query(`UPDATE perfume.item_upcs SET item_id = $2 WHERE item_id = $1`, [it.id, mergeInto]);
      await c.query(`UPDATE perfume.item_aliases SET item_id = $2 WHERE item_id = $1`, [it.id, mergeInto]);
      await c.query(`UPDATE perfume.price_list_rows SET item_id = $2 WHERE item_id = $1`, [it.id, mergeInto]);
      merged++;
    } else {
      const lineHouseMoved = brand !== it.brand && id.nameText.startsWith(`${it.brand} `);
      const newName = lineHouseMoved ? id.nameText : it.name;
      const display = it.display_name.startsWith(`${it.brand} · `)
        ? `${brand} · ${lineHouseMoved ? `${newName}${it.display_name.slice(it.brand.length + 3 + it.name.length)}` : it.display_name.slice(it.brand.length + 3)}`
        : it.display_name;
      await c.query(`UPDATE perfume.items SET brand = $2, name = $3, identity_key = $4, display_name = $5, updated_at = now() WHERE id = $1`, [it.id, brand, newName, next, display]);
      byKey.delete(it.identity_key);
      byKey.set(next, it.id);
      renamed++;
    }
  }
  if (!opts.dryRun && (renamed || merged)) invalidateGridCache();
  return { checked: items.length, changed, renamed, merged, dry_run: opts.dryRun, samples };
}

/* ---------------- index ---------------- */

/** Loads the fragrance-name → brand cross-reference from every vendor's items (normalize.nameBrandIndex) so every
 *  reading of a line — import, Review, List analysis — uses it. Re-read on every call: one cheap query. */
/**
 * Speed (owner 2026-11-15 16:44 CT, measured live 22:33Z: every Review reload 5.7 s): the brand index was rebuilt from
 * all 14,414 items on EVERY request. It is now rebuilt only when perfume.items or perfume.brand_aliases were written —
 * read from Postgres's write counters (one catalog row per table). A write on THIS server also drops the remembered
 * index at once (invalidateGridCache runs after every desk write).
 */
let nameBrandsSig: string | null = null;
export function currentNameBrandsSig(): string | null { return nameBrandsSig; }
export async function loadNameBrands(c: PoolClient): Promise<void> {
  // Fingerprint = Postgres's own write counters for the two tables (inserts / updates / deletes since stats reset).
  // Measured live 23:05Z: hashing every item row under RLS cost 1.1–4.8 s per Review read; these counters cost one
  // catalog row each. Any write to perfume.items or perfume.brand_aliases, from any server, moves them (stats flush
  // within about a second); a stats reset only forces one rebuild.
  const sig = (await c.query<{ s: string }>(
    `SELECT string_agg(relname || ':' || n_tup_ins || ':' || n_tup_upd || ':' || n_tup_del, '|' ORDER BY relname) AS s
       FROM pg_stat_user_tables WHERE schemaname = 'perfume' AND relname IN ('items', 'brand_aliases')`)).rows[0]?.s ?? null;
  // No fingerprint read → never trust a remembered index (rebuild every time).
  if (sig !== null && sig === nameBrandsSig) return;
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const it = await c.query<{ brand: string; name: string }>(`SELECT brand, name FROM perfume.items WHERE merged_into_id IS NULL`);
  const al = Object.fromEntries(ba.rows.map((r) => [r.alias, r.brand]));
  setNameBrands(nameBrandIndex(it.rows, al));
  const n = new Map<string, number>();
  for (const r of it.rows) { const b = canonicalBrand(r.brand, al); if (b) n.set(b, (n.get(b) ?? 0) + 1); }
  setDeskBrands([...n].filter(([, c]) => c >= 5).map(([b]) => b));
  nameBrandsSig = sig;
}

export async function loadIndex(c: PoolClient): Promise<MatchIndex> {
  await loadNameBrands(c);
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
  /** My own lists only (offer / inventory): keep every list I already have, save this one under its own name and put it
   *  in use; the others stay saved and one click switches back (owner 2026-11-19: "add function to save … the current
   *  lists and comparisons, and then … switch between this one and the new testers one … offer 1, 2, 3 … or by date"). */
  save_as_new?: boolean;
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

/** ownList: the owner's own offer / inventory list — a line that names an item but has no price is kept with an empty
 *  price (owner 2026-11-14: 2 of his 582 lines had none). Supplier and competitor lists still need a price. */
export function prepare(body: ImportIn, ownList = false) {
  const saved = [] as Array<ImportRowIn & { price_cents: number | null }>;
  for (const r of body.rows) {
    const cents0 = toCents(r.price);
    const hasItem = Boolean(String(r.description ?? "").trim() || normalizeUpc(r.upc) || String(r.sku ?? "").trim());
    if (!hasItem) continue;
    if ((cents0 == null || cents0 <= 0) && !ownList) continue;
    const cents = cents0 != null && cents0 > 0 ? cents0 : null;
    const description = String(r.description ?? "").trim() || String(r.sku ?? r.upc ?? "");
    // The vendor's own item code, when the list has no SKU column but prints it in the line: MTZ writes
    // "JO MALONE ENGLISH PEAR & FREESIA 1.0 EDC L UNBOXED  (137792) - France". Without it a no-barcode
    // tester/unboxed line can never become an item, and the same line next week can never re-link by SKU.
    const tail = vendorLineTail(description);
    const sku = String(r.sku ?? "").trim() || (tail.code ?? "");
    const casePack = r.case_pack == null || String(r.case_pack).trim() === "" ? tail.casePack : r.case_pack;
    saved.push({ ...r, sku: sku || null, case_pack: casePack, description, price_cents: cents });
  }
  const total = saved.reduce((t, r) => t + (r.price_cents ?? 0), 0);
  return { saved, total };
}

/** Dry run: what an import WOULD do. Writes nothing. */
export async function previewImport(c: PoolClient, body: ImportIn): Promise<ImportCheck> {
  const vendor = await vendorById(c, body.vendor_id);
  const ix = await loadIndex(c);
  const { saved, total } = prepare(body, vendor.kind === "offer" || vendor.kind === "inventory");
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
  const { saved, total } = prepare(body, vendor.kind === "offer" || vendor.kind === "inventory");
  const check = baseCheck(body, saved.length, total);
  if (!check.totals_match) throw new ImportCheckFailed(check);

  const list = await c.query<{ id: string }>(
    `INSERT INTO perfume.price_lists (vendor_id, list_date, label, file_name, source_kind, rows_read, rows_saved, rows_skipped,
       price_total_file_cents, price_total_saved_cents, imported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [vendor.id, body.list_date, body.label ?? null, body.file_name, body.source_kind, check.rows_read, check.rows_saved, check.rows_skipped,
      check.price_total_file_cents, check.price_total_saved_cents, userId]);
  const listId = list.rows[0].id;
  const own = vendor.kind === "offer" || vendor.kind === "inventory";
  if (own && body.save_as_new) {
    // Saved list: every other list of mine is KEPT (never voided) and only taken out of use; this one is in use.
    await c.query(`UPDATE perfume.price_lists SET is_current = false WHERE vendor_id = $1 AND id <> $2 AND voided_at IS NULL`, [vendor.id, listId]);
  } else if (own && body.replaces_current === false) {
    // Added to the list in use: it joins that saved list (same name), so switching moves them together.
    const cur = (await c.query<{ id: string; label: string | null; file_name: string; list_date: string }>(
      `SELECT id, label, file_name, list_date::text FROM perfume.price_lists WHERE vendor_id = $1 AND id <> $2 AND voided_at IS NULL AND is_current
        ORDER BY imported_at LIMIT 1`, [vendor.id, listId])).rows[0];
    if (cur) {
      const name = cur.label ?? `${cur.file_name} · ${cur.list_date}`;
      await c.query(`UPDATE perfume.price_lists SET label = $3 WHERE vendor_id = $1 AND voided_at IS NULL AND is_current AND (id = $2 OR label IS NULL)`, [vendor.id, listId, name]);
    }
  }
  if (body.replaces_current !== false && !(own && body.save_as_new)) {
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
    size_text: string | null; price_cents: number | null; qty: number | null; case_pack: number | null; identity_key: string; loose_key: string;
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

/** My saved lists (offer / inventory). A saved list is every live list of that vendor sharing one name (label); a list
 *  with no name is its own saved list. Numbered per kind in the order imported (Offer 1, Offer 2 …). */
export type SavedListLine = { id: string; vendor_id: string; vendor_name: string; kind: "offer" | "inventory"; label: string | null; file_name: string;
  list_date: string; rows_saved: number; is_current: boolean; imported_at: string };
export type SavedList = { key: string; vendor_id: string; vendor_name: string; kind: "offer" | "inventory"; number: number; name: string;
  list_ids: string[]; files: string[]; first_date: string; last_date: string; lines: number; in_use: boolean; imported_at: string };
export function groupSavedLists(lines: SavedListLine[]): SavedList[] {
  const by = new Map<string, SavedList>();
  const sorted = [...lines].sort((a, b) => a.imported_at.localeCompare(b.imported_at) || a.list_date.localeCompare(b.list_date) || a.id.localeCompare(b.id));
  for (const l of sorted) {
    const key = l.label ?? l.id;
    const k = `${l.vendor_id}|${key}`;
    const g = by.get(k);
    if (!g) {
      by.set(k, { key, vendor_id: l.vendor_id, vendor_name: l.vendor_name, kind: l.kind, number: 0, name: l.label ?? `${l.file_name} · ${l.list_date}`,
        list_ids: [l.id], files: [l.file_name], first_date: l.list_date, last_date: l.list_date, lines: l.rows_saved, in_use: l.is_current, imported_at: l.imported_at });
    } else {
      g.list_ids.push(l.id); g.files.push(l.file_name); g.lines += l.rows_saved; g.in_use = g.in_use && l.is_current;
      if (l.list_date < g.first_date) g.first_date = l.list_date;
      if (l.list_date > g.last_date) g.last_date = l.list_date;
    }
  }
  const out = [...by.values()];
  const n: Record<string, number> = {};
  for (const g of out) g.number = n[g.kind] = (n[g.kind] ?? 0) + 1;
  return out;
}
export async function mySavedLists(c: PoolClient): Promise<SavedList[]> {
  const r = await c.query<SavedListLine>(
    `SELECT l.id, l.vendor_id, COALESCE(NULLIF(btrim(v.short_name), ''), v.name) AS vendor_name, v.kind, l.label, l.file_name, l.list_date::text,
            l.rows_saved, l.is_current, l.imported_at::text
       FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE l.voided_at IS NULL AND v.kind IN ('offer', 'inventory') AND v.archived_at IS NULL`);
  return groupSavedLists(r.rows);
}
export class SavedListError extends Error {}
/** Puts one saved list in use for that vendor (every other saved list of it is kept, out of use). key null = none in use. */
export async function useSavedList(c: PoolClient, vendorId: string, key: string | null): Promise<{ in_use: number }> {
  const v = await vendorById(c, vendorId);
  if (v.kind !== "offer" && v.kind !== "inventory") throw new SavedListError("only my offer list and my inventory have saved lists");
  if (key != null) {
    const hit = await c.query(`SELECT 1 FROM perfume.price_lists WHERE vendor_id = $1 AND voided_at IS NULL AND COALESCE(label, id::text) = $2 LIMIT 1`, [vendorId, key]);
    if (!hit.rowCount) throw new SavedListError("saved list not found");
  }
  const r = await c.query(
    `UPDATE perfume.price_lists SET is_current = ($2::text IS NOT NULL AND COALESCE(label, id::text) = $2::text) WHERE vendor_id = $1 AND voided_at IS NULL RETURNING is_current`,
    [vendorId, key]);
  return { in_use: r.rows.filter((x: { is_current: boolean }) => x.is_current).length };
}

/** Owner switch: count this list in the grid (current) or not. Voided lists cannot be switched. */
export async function setListCurrent(c: PoolClient, listId: string, current: boolean) {
  const r = await c.query(`UPDATE perfume.price_lists SET is_current = $2 WHERE id = $1 AND voided_at IS NULL`, [listId, current]);
  if (!r.rowCount) throw new Error("list_not_found");
}

/* ---------------- review & confirm ---------------- */

/** The engine's reading of a Review line, remembered per exact input and per brand fingerprint (same input, same
 * brand index → same reading). Dropped whole when the fingerprint changes. */
const identityCache = new Map<string, Identity>();
let identityCacheSig: string | null = null;
function cachedIdentity(line: { description: string; brand: string | null; size: string | null; gender: string | null }, aliases: Record<string, string>): Identity {
  const sig = currentNameBrandsSig();
  if (sig === null) return identify({ ...line, brandAliases: aliases });
  if (sig !== identityCacheSig || identityCache.size > 250_000) { identityCache.clear(); identityCacheSig = sig; }
  const key = JSON.stringify([line.description, line.brand, line.size, line.gender]);
  let id = identityCache.get(key);
  if (!id) { id = identify({ ...line, brandAliases: aliases }); identityCache.set(key, id); }
  return id;
}

/** Review filters read from the line itself (owner 2026-11-15: "filter by men or women, or by gender or by type, or set
 * or tester or those with suggestions"). Values are the engine's own reading of the vendor line: gender M / W / U / none,
 * type (EDT, EDP, PARFUM …), kind (SET, TESTER, MINI, REFILL … or NONE for a regular bottle), category, brand. */
/** Owner 2026-11-15 19:24 CT: "the selector or filter for only those that have suggestions … 70 and up". `suggest` reads the
 *  line's OWN suggestions (the best one's % alike): "any" = has a suggestion, "95"/"90"/"80"/"70" = best is at least that
 *  % alike, "none" = no suggestion. */
export const REVIEW_SUGGEST_BUCKETS = ["any", "95", "90", "80", "70", "none"] as const;
export type ReviewSuggestBucket = (typeof REVIEW_SUGGEST_BUCKETS)[number];
export type ReviewLineFilters = { gender?: string[]; conc?: string[]; kind?: string[]; category?: string[]; brand?: string[]; suggest?: ReviewSuggestBucket };
export type ReviewFacet = { value: string; count: number };

export async function reviewQueue(c: PoolClient, opts: { list_id?: string; list_ids?: string[]; q?: string; status?: "review" | "unmatched"; mine?: "offer"; limit: number; offset: number } & ReviewLineFilters) {
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
  const tStart = Date.now();
  await loadNameBrands(c);
  const tBrands = Date.now();
  const base = `FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.match_status <> 'matched' AND l.is_current AND l.voided_at IS NULL ${where}`;
  // Narrowed to my offer list: every waiting line is read (a few thousand at most) and kept only when it can be one
  // of my offer items; paging happens after that filter.
  const mine = opts.mine === "offer";
  // Every waiting line is read (measured 2026-11-15: 1,496 on current lists) so the line filters — which come from the
  // engine's reading of the text, not from a column — and their counts are exact; paging happens after the filters.
  const rows = await c.query(
    `SELECT r.id, r.list_id, l.vendor_id, COALESCE(NULLIF(btrim(v.short_name), ''), v.name) AS vendor_name, r.row_no, r.upc, r.sku, r.brand, r.description, r.size_text, r.case_pack, r.price_cents, r.match_status, r.suggestions, r.gender_override
       ${base} ORDER BY v.name, r.row_no`, fp);
  const tRows = Date.now();
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
  // Owner 2026-11-15 20:10 CT ("if they have the upc in common"): a waiting line whose barcode is already on an item gets
  // that item as its FIRST suggestion, read now (no rematch needed). % alike stays the words' own similarity.
  const lineUpcs = [...new Set(rows.rows.map((r: Record<string, unknown>) => String(r.upc ?? "").trim()).filter(Boolean))];
  const upcItems = new Map<string, { id: string; display_name: string; brand: string; name: string }>();
  if (lineUpcs.length) {
    for (const u of (await c.query<{ upc: string; id: string; display_name: string; brand: string; name: string }>(
      `SELECT u.upc, i.id, i.display_name, i.brand, i.name FROM perfume.item_upcs u JOIN perfume.items i ON i.id = u.item_id
        WHERE u.upc = ANY($1::text[]) AND i.merged_into_id IS NULL`, [lineUpcs])).rows) upcItems.set(u.upc, u);
  }
  const withUpcSuggestion = (r: Record<string, unknown>): Record<string, unknown> => {
    const hit = upcItems.get(String(r.upc ?? "").trim());
    if (!hit) return r;
    const list = (r.suggestions as Array<{ item_id: string }> | null) ?? [];
    if (list[0]?.item_id === hit.id) return r;
    const words = Math.round(Math.max(similarity(String(r.description ?? ""), hit.name), similarity(String(r.description ?? ""), `${hit.brand} ${hit.name}`)) * 100) / 100;
    return { ...r, suggestions: [{ item_id: hit.id, display_name: hit.display_name, score: words, why: `same UPC ${String(r.upc)} — check the words` }, ...list.filter((x) => x.item_id !== hit.id)].slice(0, 5) };
  };
  rows.rows = rows.rows.map(withUpcSuggestion);
  const out = rows.rows.map((r: Record<string, unknown>) => {
    const id = cachedIdentity({ description: String(r.description ?? ""), brand: (r.brand as string | null) ?? null, size: (r.size_text as string | null) ?? null, gender: (r.gender_override as string | null) ?? null }, aliases);
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
  const tRead = Date.now();
  type LineRow = Record<string, unknown> & { _mine?: boolean; for_my_item?: string | null; vendor_name?: unknown; gender?: string | null; conc?: string | null; flags?: string; category?: string; brand_name?: string | null };
  // Grouped by my item, then vendor, so the owner confirms item by item.
  const scoped: LineRow[] = !mine ? (out as LineRow[]) : (out as LineRow[]).filter((r) => r._mine)
    .sort((a, b) => String(a.for_my_item).localeCompare(String(b.for_my_item)) || String(a.vendor_name).localeCompare(String(b.vendor_name)))
    .map(({ _mine: _drop, ...rest }) => rest);
  const genderOf = (r: LineRow) => (r.gender ? String(r.gender) : "none");
  const concOf = (r: LineRow) => (r.conc ? String(r.conc) : "none");
  const kindsOf = (r: LineRow) => { const f = String(r.flags ?? "").split(/\s+/).filter(Boolean); return f.length ? f : ["NONE"]; };
  const catOf = (r: LineRow) => String(r.category ?? "Unknown");
  const brandOf = (r: LineRow) => (r.brand_name ? String(r.brand_name) : "none");
  const bestPct = (r: LineRow) => {
    const s = (r.suggestions as Array<{ score?: number }> | null | undefined)?.[0];
    return s && typeof s.score === "number" ? Math.round(s.score * 100) : null;
  };
  const inBucket = (r: LineRow, b: ReviewSuggestBucket) => {
    const pct = bestPct(r);
    if (b === "none") return pct == null;
    if (b === "any") return pct != null;
    return pct != null && pct >= Number(b);
  };
  const want = (vals: string[] | undefined) => (vals?.length ? new Set(vals) : null);
  const wG = want(opts.gender), wC = want(opts.conc), wK = want(opts.kind), wCat = want(opts.category), wB = want(opts.brand);
  const pass = (r: LineRow, skip?: "gender" | "conc" | "kind" | "category" | "brand" | "suggest") =>
    (skip === "gender" || !wG || wG.has(genderOf(r))) && (skip === "conc" || !wC || wC.has(concOf(r))) &&
    (skip === "kind" || !wK || kindsOf(r).some((k) => wK.has(k))) && (skip === "category" || !wCat || wCat.has(catOf(r))) &&
    (skip === "brand" || !wB || wB.has(brandOf(r))) && (skip === "suggest" || !opts.suggest || inBucket(r, opts.suggest));
  // Each filter's counts are measured with every OTHER filter applied, so a count is the number of lines that choice shows.
  const facet = (key: "gender" | "conc" | "kind" | "category" | "brand", read: (r: LineRow) => string[]): ReviewFacet[] => {
    const n = new Map<string, number>();
    for (const r of scoped) if (pass(r, key)) for (const v of read(r)) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  const kept = scoped.filter((r) => pass(r));
  // Measured per request (owner 2026-11-15: "make it faster"): where a Review read spends its time.
  console.info(JSON.stringify({ perfume_review_ms: { brands: tBrands - tStart, rows: tRows - tBrands, read: tRead - tRows, total: Date.now() - tStart, lines: rows.rows.length, cached: identityCache.size } }));
  return {
    rows: kept.slice(opts.offset, opts.offset + opts.limit),
    total: kept.length,
    facets: {
      gender: facet("gender", (r) => [genderOf(r)]), conc: facet("conc", (r) => [concOf(r)]), kind: facet("kind", kindsOf),
      category: facet("category", (r) => [catOf(r)]), brand: facet("brand", (r) => [brandOf(r)]),
      // Each bucket counted with every other filter applied (the buckets overlap: 95%+ is inside 70%+ and "any").
      suggest: REVIEW_SUGGEST_BUCKETS.map((b) => ({ value: b, count: scoped.filter((r) => pass(r, "suggest") && inBucket(r, b)).length })),
    },
  };
}

/**
 * Owner confirms a line: it IS this item (or a new item). Remembered as this vendor's spelling and SKU, attaches
 * the line's UPC to the item, and applies to every other unconfirmed line of that vendor with the same spelling or SKU.
 */

export async function confirmRow(c: PoolClient, userId: string, rowId: string, target: { item_id?: string; create_new?: boolean }, index?: MatchIndex) {
  const row = (await c.query<{ id: string; list_id: string; vendor_id: string; upc: string | null; sku: string | null; brand: string | null; description: string; size_text: string | null; identity_key: string; loose_key: string; gender_override: string | null }>(
    `SELECT r.id, r.list_id, l.vendor_id, r.upc, r.sku, r.brand, r.description, r.size_text, r.identity_key, r.loose_key, r.gender_override
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id WHERE r.id = $1`, [rowId])).rows[0];
  if (!row) throw new Error("row_not_found");
  let itemId = target.item_id ?? null;
  if (!itemId && target.create_new) {
    // Only the line's own reading is needed here; a bulk "create new" passes the index it loaded once (measured 11-16:
    // reloading ~20,000 items for every line made 3,000 lines take hours).
    const ix = index ?? await loadIndex(c);
    const m = matchLine(ix, row.vendor_id, { description: row.description, brand: row.brand, size_text: row.size_text, gender: row.gender_override }, { allowNewItem: false });
    const id = m.identity;
    if (!id.nameWords.length) throw new Error("item_needs_a_name");
    // The same reading IS the same product: when a live item already holds this identity (another vendor's line, or an
    // earlier line of the same bulk), the line links to it. Inserting again broke items_identity_key_uq and rolled back
    // the whole bulk (measured 11-16, 100 lines per batch).
    const same = (await c.query<{ id: string }>(`SELECT id FROM perfume.items WHERE identity_key = $1 AND merged_into_id IS NULL LIMIT 1`, [id.key])).rows[0];
    if (same) itemId = same.id;
    else {
      const ins = await c.query<{ id: string }>(
        `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [id.brand, id.nameText, id.sizeMl, id.conc, id.gender, id.flags, id.key, looseKey(id), displayNameOf(id), userId]);
      itemId = ins.rows[0].id;
    }
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
  // The owner's confirmation is the authority on what a barcode is (owner 2026-11-14: "AZZ WTD … REFILL … it is not the
  // same item at all"): the barcode moves to the item he chose, so the next import links it there too.
  // Except a NEW item made from the line ("create new"): the barcode already on another item stays there. A line that
  // is a different KIND of product than the item carrying its barcode (TESTER / SET / MINI of the plain bottle, measured
  // 11-16: 694 waiting lines) becomes its own item, and the plain bottle must keep linking every vendor's plain line.
  // Only a real barcode is filed: lines stored before normalizeUpc checked its length after the zero strip (PCA "9188307",
  // 11-16) would break item_upcs_upc_check and roll back a whole bulk.
  const upc = normalizeUpc(row.upc);
  if (upc) {
    await c.query(
      target.create_new
        ? `INSERT INTO perfume.item_upcs (upc, item_id, first_seen_list_id) VALUES ($1,$2,$3) ON CONFLICT (upc) DO NOTHING`
        : `INSERT INTO perfume.item_upcs (upc, item_id, first_seen_list_id) VALUES ($1,$2,$3) ON CONFLICT (upc) DO UPDATE SET item_id = EXCLUDED.item_id`,
      [upc, itemId, row.list_id]);
  }
  // This line is relinked even when it was matched (a wrong match is corrected here); other lines with the same
  // text / SKU follow only when they are not matched yet.
  const applied = await c.query(
    `UPDATE perfume.price_list_rows r SET item_id = $1, match_method = 'confirmed', match_status = 'matched', suggestions = '[]'::jsonb
       FROM perfume.price_lists l
      WHERE l.id = r.list_id AND l.vendor_id = $2
        AND (r.id = $3 OR r.match_status <> 'matched') AND (r.id = $3 OR (upper(regexp_replace(concat_ws(' ', coalesce(r.brand,''), r.description, coalesce(r.size_text,'')), '\\s+', ' ', 'g')) = $4)
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
  const bulkIx = b.action === "create_new" ? await loadIndex(c) : undefined;
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
      const r = await confirmRow(c, userId, id, target, bulkIx);
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
  // One UPDATE per 500 lines, not one per line (measured live 11-14 01:22Z: 3,000+ single-row updates ran 270 s and the
  // request died with a 502). Same values, same rules.
  const upd: Array<{ id: string; item_id: string | null; method: string | null; status: string; suggestions: unknown; identity_key: string; loose_key: string }> = [];
  let n = 0;
  for (const r of rows.rows) {
    // Let the server answer its health checks while a few thousand lines are read.
    if (++n % 100 === 0) await new Promise((res) => setImmediate(res));
    const m = matchLine(ix, r.vendor_id, { upc: r.upc, sku: r.sku, description: r.description, brand: r.brand, size_text: r.size_text, gender: r.gender_override }, { allowNewItem: false });
    if (m.itemId) {
      upd.push({ id: r.id, item_id: m.itemId, method: m.method, status: "matched", suggestions: [], identity_key: m.identity.key, loose_key: looseKey(m.identity) });
      out.now_matched++;
    } else {
      upd.push({ id: r.id, item_id: null, method: null, status: m.status, suggestions: m.suggestions, identity_key: m.identity.key, loose_key: looseKey(m.identity) });
      if (m.status === "review") out.review++; else out.unmatched++;
    }
  }
  for (let i = 0; i < upd.length; i += 500) {
    await c.query(
      `UPDATE perfume.price_list_rows r
          SET item_id = CASE WHEN x.status = 'matched' THEN x.item_id ELSE r.item_id END,
              match_method = CASE WHEN x.status = 'matched' THEN x.method ELSE r.match_method END,
              match_status = x.status, suggestions = x.suggestions, identity_key = x.identity_key, loose_key = x.loose_key
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, item_id uuid, method text, status text, suggestions jsonb, identity_key text, loose_key text)
        WHERE r.id = x.id`, [JSON.stringify(upd.slice(i, i + 500))]);
  }
  // Links made by barcode BEFORE the kind rule (2026-11-14): a line that says REFILL / TESTER / SET / MINI … sitting
  // on an item of another kind goes back to Review for the owner. Owner-confirmed links are never touched.
  const linked = await c.query<{ id: string; brand: string | null; description: string; size_text: string | null; gender_override: string | null; flags: string[] }>(
    `SELECT r.id, r.brand, r.description, r.size_text, r.gender_override, i.flags
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.items i ON i.id = r.item_id
      WHERE r.match_status = 'matched' AND r.match_method = 'upc' AND l.is_current AND l.voided_at IS NULL`);
  let kindClash = 0;
  let k = 0;
  for (const r of linked.rows) {
    if (++k % 200 === 0) await new Promise((res) => setImmediate(res));
    const id = identify({ description: r.description, brand: r.brand, size: r.size_text, gender: r.gender_override, brandAliases: ix.brandAliases });
    if (productKind(id.flags) === productKind(r.flags)) continue;
    await c.query(`UPDATE perfume.price_list_rows SET item_id = NULL, match_method = NULL, match_status = 'review', suggestions = $2::jsonb WHERE id = $1`,
      [r.id, JSON.stringify(suggest(ix, id))]);
    kindClash++;
  }
  const split = await relinkSplitItems(c, ix);
  return { ...out, kind_clash_to_review: kindClash, ...split };
}

/**
 * Owner 2026-11-14 18:50 CT: "almost all my items should be linked to items from pca, mtz and those companies as well …
 * keep the mapping engine correct so every time i upload a new list it matches and assigns correctly". Measured 18:52:
 * 163 of the 463 items on his offer list had no supplier line — his list's brand codes (CALVI, NAUTI, LACOS, JEAN …)
 * and brand words left in the name ("CK DEFY", "JPG DIVINE") had made a second item for the same bottle.
 *
 * Every line the engine linked (never one the owner confirmed) whose item no OTHER vendor carries is read again with
 * today's brand rules. When that reading is exactly an item another vendor carries — same identity key: brand, name,
 * size, type, gender, kind — the line moves to it, its barcodes follow, and the emptied item is merged into it.
 */
export async function relinkSplitItems(c: PoolClient, ix: MatchIndex): Promise<{ split_lines_relinked: number; split_items_merged: number }> {
  const rows = (await c.query<{ id: string; item_id: string; vendor_id: string; brand: string | null; description: string; size_text: string | null; gender_override: string | null }>(
    `WITH cur AS (
       SELECT r.id, r.item_id, l.vendor_id, r.brand, r.description, r.size_text, r.gender_override, r.match_method
         FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
        WHERE l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL AND r.match_status = 'matched')
     SELECT a.id, a.item_id, a.vendor_id, a.brand, a.description, a.size_text, a.gender_override FROM cur a
      WHERE coalesce(a.match_method, '') <> 'confirmed'
        AND NOT EXISTS (SELECT 1 FROM cur b WHERE b.item_id = a.item_id AND b.vendor_id <> a.vendor_id)`)).rows;
  const carriedBy = new Map<string, Set<string>>();
  for (const r of (await c.query<{ item_id: string; vendor_id: string }>(
    `SELECT DISTINCT r.item_id, l.vendor_id FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
      WHERE l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL`)).rows) {
    const s = carriedBy.get(r.item_id) ?? new Set<string>(); s.add(r.vendor_id); carriedBy.set(r.item_id, s);
  }
  let relinked = 0;
  const emptied = new Map<string, string>();
  for (const r of rows) {
    const id = identify({ description: r.description, brand: r.brand, size: r.size_text, gender: r.gender_override, brandAliases: ix.brandAliases });
    if (!id.brand || !id.nameWords.length) continue;
    const ck = compactKey(id.key);
    const cc = ck ? ix.byCompact.get(ck) ?? [] : [];
    const target = ix.byKey.get(id.key) ?? (cc.length === 1 ? cc[0] : undefined);
    if (!target || target === r.item_id) continue;
    const others = carriedBy.get(target);
    if (!others || ![...others].some((v) => v !== r.vendor_id)) continue;
    const t = ix.items.get(target);
    if (!t || productKind(t.flags) !== productKind(id.flags)) continue;
    await c.query(`UPDATE perfume.price_list_rows SET item_id = $2, match_method = 'key', identity_key = $3, loose_key = $4 WHERE id = $1`,
      [r.id, target, id.key, looseKey(id)]);
    relinked++;
    emptied.set(r.item_id, target);
  }
  let merged = 0;
  for (const [from, to] of emptied) {
    const left = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM perfume.price_list_rows WHERE item_id = $1`, [from])).rows[0]!.n;
    if (left > 0) continue;
    await c.query(`UPDATE perfume.item_upcs SET item_id = $2 WHERE item_id = $1 AND NOT EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = $2 AND u.upc = perfume.item_upcs.upc)`, [from, to]);
    await c.query(`UPDATE perfume.item_aliases SET item_id = $2 WHERE item_id = $1`, [from, to]);
    await c.query(`UPDATE perfume.items SET merged_into_id = $2, updated_at = now() WHERE id = $1 AND merged_into_id IS NULL`, [from, to]);
    merged++;
  }
  if (relinked) invalidateGridCache();
  return { split_lines_relinked: relinked, split_items_merged: merged };
}

/** gender (M / W): the line being linked is that gender — the other gender's bottles are never offered (owner
 *  2026-11-14 17:22: Light Blue Men linked by accident to Light Blue Women). Unisex / unstated items stay. */
export async function searchItems(c: PoolClient, q: string, limit = 25, gender: "M" | "W" | null = null) {
  const s = q.trim();
  if (!s) return [];
  // Every word must appear somewhere in the item's name, in any order (owner 2026-11-12: "when searching for an
  // item it is not working" — "armani code" did not find "GIORGIO ARMANI · ARMANI CODE · …"). A digits-only
  // word also matches a UPC; the internal code still matches exactly.
  const words = s.toUpperCase().replace(/[^A-Z0-9.&' ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
  return (await c.query(
    `SELECT i.id, i.display_name, i.internal_code, NULLIF(i.gender, '') AS gender, (SELECT array_agg(u.upc) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs
       FROM perfume.items i
      WHERE i.merged_into_id IS NULL
        AND ($4::text IS NULL OR COALESCE(NULLIF(i.gender, ''), 'U') IN ('U', $4))
        AND (i.internal_code = $1
             OR EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = i.id AND u.upc = ltrim(regexp_replace($1,'\\D','','g'),'0'))
             OR (cardinality($2::text[]) > 0 AND NOT EXISTS (SELECT 1 FROM unnest($2::text[]) w WHERE upper(i.display_name) NOT LIKE '%' || w || '%')))
      ORDER BY similarity(i.display_name, $1) DESC LIMIT $3`, [s, words, limit, gender])).rows;
}

/** Competitor lines (every current competitor list — kind "sell") for the List-analysis match box: every word must be in the line,
 *  in any order; a number also matches its UPC or code. Linked lines are returned too, with what they are linked to,
 *  so a wrong link can be seen and corrected (owner 2026-11-14: "the box to search, suggestions … the correct matching engine"). */
export async function searchCompetitorLines(c: PoolClient, q: string, limit = 25, gender: "M" | "W" | null = null) {
  const s = q.trim();
  if (!s) return [];
  const words = s.toUpperCase().replace(/[^A-Z0-9.&' ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const found = (await c.query<{ row_id: string; description: string; vendor: string; price_cents: number | null; linked_to: string | null; brand: string | null; size_text: string | null; gender_override: string | null }>(
    `SELECT r.id AS row_id, r.description, r.brand, r.size_text, r.gender_override, v.name AS vendor, r.price_cents::int AS price_cents, i.display_name AS linked_to
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
       LEFT JOIN perfume.items i ON i.id = r.item_id
      WHERE v.kind = 'sell' AND l.is_current AND l.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM unnest($1::text[]) w
                         WHERE upper(r.description || ' ' || coalesce(r.upc, '') || ' ' || coalesce(r.sku, '')) NOT LIKE '%' || w || '%')
      ORDER BY similarity(r.description, $2) DESC, r.description LIMIT $3`, [words, s, gender ? limit * 3 : limit])).rows;
  // My item is that gender: a line that says the other gender is never offered; each line carries the gender it says.
  return found.map(({ brand, size_text, gender_override, ...r }) => ({ ...r, gender: lineGender(r.description, identify({ description: r.description, brand, size: size_text, gender: gender_override }).gender) || null }))
    .filter((r) => !gender || !r.gender || r.gender === "U" || r.gender === gender).slice(0, limit);
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
type GridPayload = { cols: GridCol[]; rows: GridRow[]; rules: DeskRules; vendors: VendorRow[]; target_pct: number; earn_pct: number; _vk: string;
  /** List analysis, one row per LINE: my offer list (every line) and the competitors' full lists. */
  myLines?: GridRow[]; theirLines?: GridRow[] };
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
export function invalidateGridCache(opts: { itemsUnchanged?: boolean } = {}): void {
  _gridCache.clear(); _viewCache.clear(); _gridVer++;
  // The brand index reads only perfume.items and perfume.brand_aliases. A confirm that links a line to an EXISTING item
  // writes neither, so the index stays (measured live 11-16: every Review read after a confirm rebuilt it, 2.2–7.1 s).
  if (!opts.itemsUnchanged) nameBrandsSig = null;
}
/** Lets the server answer other requests (health checks, the owner's other tabs) while a grid builds: measured live
 *  11-16 19:59Z, a 103 s build blocked the process, its health check failed and the instance was restarted (502s). */
const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/** The competitor line a row is measured against: its list price, cushion, SALES price (list − cushion), wording. */
export type CompBest = { list: number; cushion: number; real: number; desc: string | null; vendor: string };
type AnalysisIn = {
  upc: string | null; sku: string | null; brand: string | null; name: string | null; size: number | null; type: string | null; gender: string | null;
  purchDate: string | null; qtyPurch: number | null; cost: number | null; sold: number | null; invQty: number | null; offer: number | null;
  comp: CompBest | null; lowVendor: string | null; lowPrice: number | null; minMargin: number; myDesc: string | null;
  /** The brand the engine read on the competitor's line (owner 17:34: "add a brand column so I can confirm the brands"). */
  cBrand?: string | null;
};
/** LIST ANALYSIS — the owner's own format (11-14-2026 PERFUME_ENGINE_FORMATS.xlsx), his formulas cell for cell:
 *  Margin = (offer − last cost) ÷ offer · Markup = (offer − last cost) ÷ last cost · Esperanza price = their SALES
 *  price (list − cushion) · Lowest sales price = min(offer, Esperanza) · Min purchase price = Esperanza × (1 − min
 *  margin) · Under by = Esperanza − offer when I am under · Under % = under ÷ Esperanza · Can increase % = under ÷ offer ·
 *  New margin = (Esperanza − last cost) ÷ Esperanza · Over by = offer − Esperanza · Lower % = over ÷ offer.
 *  Blank stays blank — never a guessed cost, date or price. Money in cents, percentages in %. */
export function analysisFields(a: AnalysisIn): Record<string, string | number | null> {
  const p1 = (x: number) => Math.round(x * 1000) / 10;
  const esp = a.comp?.real ?? null;
  const offer = a.offer;
  const both = offer != null && esp != null;
  const under = both ? (offer! < esp! ? esp! - offer! : 0) : null;
  const over = both ? (offer! > esp! ? offer! - esp! : 0) : null;
  const minBuy = both && esp! < offer! ? Math.round(esp! * (1 - a.minMargin / 100)) : null;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  // The recommendation, from the same numbers (owner 19:03 CT: "check the logic, if i am purchasing cheaper and selling
  // cheaper. then the recommendations"): Esperanza cheaper → lower to their price only if I can buy at or under the
  // min purchase price; I am cheaper → room to raise to their price; a supplier under my last cost → buy there.
  const advice = (() => {
    if (offer == null) return esp == null ? null : "Not on my list";
    if (esp == null) return "Not on Esperanza's list";
    const cheaperBuy = a.lowPrice != null && a.cost != null && a.lowPrice < a.cost ? ` · buy from ${a.lowVendor ?? "supplier"} at ${money(a.lowPrice)} (your last cost ${money(a.cost)})` : "";
    if (offer > esp) {
      if (a.lowPrice != null && minBuy != null && a.lowPrice <= minBuy) return `LOWER to ${money(esp)} — buy from ${a.lowVendor ?? "supplier"} at ${money(a.lowPrice)} keeps ${a.minMargin}%+`;
      if (a.cost != null && minBuy != null && a.cost <= minBuy) return `LOWER to ${money(esp)} — your last cost ${money(a.cost)} keeps ${a.minMargin}%+`;
      return `CAN'T MATCH at ${a.minMargin}% — need cost ≤ ${money(minBuy ?? 0)}${a.lowPrice != null ? `, lowest supplier ${money(a.lowPrice)}` : ""}`;
    }
    if (offer < esp) return `RAISE up to ${money(esp)} (+${money(esp - offer)})${cheaperBuy}`;
    return `SAME as Esperanza${cheaperBuy}`;
  })();
  return {
    "a:upc": a.upc, "a:sku": a.sku, "a:brand": a.brand, "a:name": a.name, "a:size": a.size, "a:type": a.type,
    "a:kind": ({ M: "Men", W: "Women", U: "Unisex" } as Record<string, string>)[a.gender ?? ""] ?? null,
    "a:purch_date": a.purchDate, "a:qty": a.qtyPurch, "a:last_cost": a.cost, "a:sold": a.sold, "a:inv_qty": a.invQty,
    // Owner 2026-11-15 13:27 CT: "its ok for it to show 0 since we do not have the last cost, but the engines must be
    // fully built" — Margin / Markup / New Margin read 0 until a LAST COST exists, never blank.
    "a:margin": offer != null && offer > 0 ? (a.cost != null ? p1((offer - a.cost) / offer) : 0) : null,
    "a:markup": offer != null ? (a.cost ? p1((offer - a.cost) / a.cost) : 0) : null,
    "a:offer": offer, "a:esp": esp,
    "a:low_sales": offer == null && esp == null ? null : Math.min(...[offer, esp].filter((x): x is number => x != null)),
    // Owner 2026-11-14 19:03 CT: "the min purchase price to match esperanza should only have items that esperanza is
    // cheaper". Only where Esperanza sells for less than my offer is there a price to match.
    "a:min_buy": minBuy, "a:min_margin": a.minMargin,
    "a:low_vendor": a.lowVendor, "a:low_price": a.lowPrice,
    // Can I buy it cheap enough to match? The lowest supplier price against the most I can pay.
    "a:buy_check": minBuy == null ? null : a.lowPrice == null ? "No supplier price"
      : a.lowPrice <= minBuy ? `YES — ${a.lowVendor ?? "supplier"} ${money(a.lowPrice)} ≤ ${money(minBuy)}` : `NO — lowest ${money(a.lowPrice)} is ${money(a.lowPrice - minBuy)} over`,
    "a:offer2": offer, "a:esp2": esp,
    "a:under_by": under, "a:under_pct": under != null && esp! > 0 ? p1(under / esp!) : null,
    "a:can_inc": under != null && offer! > 0 ? p1(under / offer!) : null,
    "a:new_margin": esp != null && esp > 0 ? (a.cost != null ? p1((esp - a.cost) / esp) : 0) : null,
    // Over by is NEGATIVE (owner 2026-11-14: "the over by should be negatives so we can really see we are selling more
    // expensive"); the % to lower stays positive — how much to take off my price.
    "a:over_by": over == null ? null : over === 0 ? 0 : -over, "a:lower_pct": over != null && offer! > 0 ? p1(over / offer!) : null,
    "a:advice": advice,
    "a:c_list": a.comp?.list ?? null, "a:c_cushion": a.comp?.cushion ?? null, "a:c_sales": esp,
    "a:my_desc": a.myDesc, "a:c_desc": a.comp?.desc ?? null, "a:c_brand": a.comp ? (a.cBrand ?? null) : null, "a:c_vendor": a.comp?.vendor ?? null,
  };
}
/** A one-click link for a row that is not matched yet: link competitor/my line `row_id` to item `item_id`. */
export type MatchCandidate = { row_id: string; item_id: string; label: string; price_cents: number | null; why: string };

/** Builds in flight, per cache key (owner 2026-11-15 20:15 CT "i need speed"): measured 02:15Z, four requests that
 *  arrived while the grid was cold each built it again in parallel (41 s each). Now they wait on the ONE build. */
const _gridBuilding = new Map<string, Promise<GridPayload>>();

/** ROUND 12 — the write counters of every perfume table. The backend runs 4+ servers, each with its own cache;
 *  _gridVer only moves on the server that took the write, so the others kept serving the grid from before a Review
 *  confirm. One catalog read (milliseconds); any write on any server moves it. */
async function perfumeDataSig(c: PoolClient): Promise<string | null> {
  try {
    return (await c.query<{ s: string }>(
      `SELECT string_agg(relname || ':' || n_tup_ins || ':' || n_tup_upd || ':' || n_tup_del, '|' ORDER BY relname) AS s
         FROM pg_stat_user_tables WHERE schemaname = 'perfume'`)).rows[0]?.s ?? null;
  } catch {
    return null;
  }
}

/** My list price against my costs (owner 2026-11-17 14:04 CT: "all price boxes editable … engine automatically
 *  calculates for that item the margin etc."). One function, used by the grid build; the desk's frontend repeats it
 *  (perfumePriceMath.ts, same fixtures in both tests) so a typed price recomputes the row at once, then the server's
 *  rebuild replaces it. Margin = (price − cost) ÷ price · Markup = (price − cost) ÷ cost. Owner 2026-11-15 13:27 CT:
 *  margin and markup read 0 until a cost exists (never blank) when there is a price; blank with no price. */
export function myPriceMath(offer: number | null, last: number | null, avg: number | null, lowBuy: number | null): Record<string, number | null> {
  const p1 = (x: number) => Math.round(x * 1000) / 10;
  const margin = (cost: number | null) => (offer == null || offer <= 0 ? null : cost == null ? 0 : p1((offer - cost) / offer));
  const markup = (cost: number | null) => (offer == null ? null : cost == null || cost <= 0 ? 0 : p1((offer - cost) / cost));
  return {
    offer_profit: offer != null && last != null ? offer - last : null,
    offer_margin_pct: margin(last), offer_markup_pct: markup(last),
    offer_margin_avg_pct: margin(avg), offer_markup_avg_pct: markup(avg),
    buy_margin_pct: offer != null && offer > 0 && lowBuy != null ? p1((offer - lowBuy) / offer) : null,
    buy_markup_pct: offer != null && lowBuy != null && lowBuy > 0 ? p1((offer - lowBuy) / lowBuy) : null,
  };
}

/** Owner 2026-11-17: type my list price or my cost right on the desk. My list price writes the line(s) of my CURRENT
 *  offer list (one line by line_id, or every line of the item); the old price is kept on the line (raw.price_edits).
 *  My last / avg cost write perfume.item_costs (the old value kept in edits). Nothing outside my own lists is written. */
export async function setMyPrice(c: PoolClient, uid: string, b: { item_id?: string | null; line_id?: string | null; field: "offer" | "last_cost" | "avg_cost"; cents: number | null }):
  Promise<{ updated: number }> {
  if (b.field === "offer") {
    if (b.cents == null) throw new MyPriceError("price_required");
    if (!b.line_id && !b.item_id) throw new MyPriceError("item_or_line_required");
    const r = await c.query(
      `UPDATE perfume.price_list_rows r
          SET price_cents = $3,
              raw = coalesce(r.raw, '{}'::jsonb) || jsonb_build_object('price_edits', coalesce(r.raw->'price_edits', '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('from', r.price_cents, 'to', $3::int, 'at', now(), 'by', $4::text)))
         FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id
        WHERE l.id = r.list_id AND v.kind = 'offer' AND l.is_current AND l.voided_at IS NULL
          AND (($1::uuid IS NOT NULL AND r.id = $1::uuid) OR ($1::uuid IS NULL AND r.item_id = $2::uuid))`,
      [b.line_id ?? null, b.item_id ?? null, b.cents, uid]);
    if (!r.rowCount) throw new MyPriceError("not_on_my_list");
    return { updated: r.rowCount };
  }
  if (!b.item_id) throw new MyPriceError("item_required");
  const col = b.field === "last_cost" ? "last_cost_cents" : "avg_cost_cents";
  const r = await c.query(
    `INSERT INTO perfume.item_costs AS t (item_id, ${col}, edits, updated_by, updated_at)
     VALUES ($1, $2, jsonb_build_array(jsonb_build_object('field', $3::text, 'from', NULL, 'to', $2::int, 'at', now(), 'by', $5::text)), $4::uuid, now())
     ON CONFLICT (item_id) DO UPDATE SET ${col} = $2,
       edits = t.edits || jsonb_build_array(jsonb_build_object('field', $3::text, 'from', t.${col}, 'to', $2::int, 'at', now(), 'by', $5::text)),
       updated_by = $4::uuid, updated_at = now()`,
    [b.item_id, b.cents, b.field, uid, uid]);
  return { updated: r.rowCount ?? 0 };
}
export class MyPriceError extends Error {}

export async function buildGrid(c: PoolClient, opts: { targetPct?: number | null; earnPct?: number | null } = {}): Promise<GridPayload> {
  // No fingerprint read → a key no earlier build carries (a remembered grid is never trusted without one).
  const sig = (await perfumeDataSig(c)) ?? "nosig";
  const _cacheKey = `v${_gridVer}|${sig}|${opts.targetPct ?? "null"}|${opts.earnPct ?? "null"}`;
  // A new fingerprint makes every remembered grid and view stale: drop them (bounded memory, never a stale read).
  for (const k of _gridCache.keys()) if (!k.includes(`|${sig}|`)) { _gridCache.clear(); _viewCache.clear(); break; }
  const _cached = _gridCache.get(_cacheKey);
  if (_cached) return _cached;
  const building = _gridBuilding.get(_cacheKey);
  if (building) return building;
  const p = buildGridUncached(c, opts, _cacheKey).finally(() => _gridBuilding.delete(_cacheKey));
  _gridBuilding.set(_cacheKey, p);
  return p;
}

async function buildGridUncached(c: PoolClient, opts: { targetPct?: number | null; earnPct?: number | null }, _cacheKey: string): Promise<GridPayload> {
  await loadNameBrands(c);
  const rules = await getRules(c);
  const target = targetPctOf(rules, opts.targetPct);
  // Typed on the Trading tab: one % for every vendor. Not typed: each vendor's own saved %, else the rule.
  const earnTyped = opts.earnPct == null ? null : earnPctOf(rules, opts.earnPct);
  const vendors = await listVendors(c);
  const buyV = vendors.filter((v) => v.kind === "buy" || v.kind === "both");
  const sellV = vendors.filter((v) => v.kind === "sell" || v.kind === "both");
  // List analysis compares my list with the LAREDO competitor's list (owner 2026-11-17 14:04 CT: "analysis, it is supposed
  // to be with la esperanza … verify it is the correct list"). Measured that hour: 27 supplier lists had been saved as
  // "both", so "Esperanza Price" was the cheapest of 28 lists. The analysis reads only competitor lists (kind "sell"),
  // never a supplier's, whatever a supplier is marked.
  const compV = vendors.filter((v) => v.kind === "sell");
  const compIds = new Set(compV.map((v) => v.id));
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
  // Every LINE of my offer list (owner 2026-11-14: "my lists there are 583 rows - 1 header, so 582 items … why does the
  // list in list analysis only have 463"): lines, not items — the same bottle can sit on several lines (stock lots).
  const myLineQ = await c.query<{ id: string; item_id: string | null; description: string; upc: string | null; sku: string | null; brand: string | null; size_text: string | null;
    price_cents: number | null; qty: number | null; match_status: string; suggestions: Array<{ item_id: string; display_name: string; score: number; why?: string }> | null }>(
    `SELECT r.id, r.item_id, r.description, r.upc, r.sku, r.brand, r.size_text, r.price_cents::int AS price_cents, r.qty, r.match_status, r.suggestions
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE v.kind = 'offer' AND l.is_current AND l.voided_at IS NULL ORDER BY l.list_date DESC, r.row_no`);
  // Every LINE of every competitor's current list ("if i select their list then it will be showing all esperanzas or
  // any other competitors full list").
  const theirLineQ = await c.query<{ id: string; vendor_id: string; item_id: string | null; description: string; brand: string | null; size_text: string | null;
    gender_override: string | null; price_cents: number | null; match_status: string }>(
    `SELECT r.id, l.vendor_id, r.item_id, r.description, r.brand, r.size_text, r.gender_override, r.price_cents::int AS price_cents, r.match_status
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE v.kind = 'sell' AND l.is_current AND l.voided_at IS NULL ORDER BY v.name, r.row_no`);
  // My own costs typed on the desk (owner 2026-11-17: last cost and average cost per item, every tab).
  const myCostQ = await c.query<{ item_id: string; last_cost_cents: number | null; avg_cost_cents: number | null }>(
    `SELECT item_id, last_cost_cents, avg_cost_cents FROM perfume.item_costs`);
  const typedCost = new Map(myCostQ.rows.map((r) => [r.item_id, r]));
  // My stock with no inventory file = the SUM of every line of that bottle on my list (Blue Cielo sits on 11 lines).
  const offerQtySum = new Map<string, number>();
  for (const l of myLineQ.rows) if (l.item_id && l.qty != null) offerQtySum.set(l.item_id, (offerQtySum.get(l.item_id) ?? 0) + l.qty);
  const anByItem = new Map<string, { cBest: CompBest | null; lowVendor: string | null; lowPrice: number | null }>();
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
    // Owner 2026-11-15 20:43 CT ("yes change"): this is an ESTIMATE from the suppliers' lists (cheapest supplier price −
    // low cushion + high freight), never his cost — named so. His real cost is "My actual cost" (his inventory file).
    { key: "landed_likely", label: "Est. cost (best supplier)", group: "Mine", kind: "money" },
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
    { key: "my_avg_cost", label: "My avg cost", group: "Mine", kind: "money" },
    { key: "low_buy_price", label: "Lowest supplier price", group: "Mine", kind: "money" },
    { key: "low_buy_vendor", label: "Lowest supplier", group: "Mine", kind: "text" },
    { key: "my_purchase_date", label: "Purchase date", group: "Mine", kind: "text" },
    { key: "my_qty_purchased", label: "Qty purchased", group: "Mine", kind: "int" },
    { key: "my_qty_sold", label: "Qty sold", group: "Mine", kind: "int" },
  );
  if (hasOffer) mineCols.push(
    { key: "my_offer_desc", label: "My description", group: "Mine", kind: "text" },
    // Owner 2026-11-17 14:04 CT: "i still need to view my list price … my last cost, avg cost … margins, mark up etc.
    // all the same data so i can make the correct decisions and purchases" — on every tab, the same figures.
    { key: "my_offer_price", label: "My list price", group: "Mine", kind: "money" },
    { key: "offer_profit", label: "My profit $ (last cost)", group: "Mine", kind: "money" },
    { key: "offer_margin_pct", label: "My margin % (last cost)", group: "Mine", kind: "pct" },
    { key: "offer_markup_pct", label: "My markup % (last cost)", group: "Mine", kind: "pct" },
    { key: "offer_margin_avg_pct", label: "My margin % (avg cost)", group: "Mine", kind: "pct" },
    { key: "offer_markup_avg_pct", label: "My markup % (avg cost)", group: "Mine", kind: "pct" },
    { key: "buy_margin_pct", label: "Margin % buying at lowest supplier", group: "Mine", kind: "pct" },
    { key: "buy_markup_pct", label: "Markup % buying at lowest supplier", group: "Mine", kind: "pct" },
    { key: "offer_vs_low", label: "Offer vs lowest", group: "Mine", kind: "money" },
    { key: "offer_action", label: "My offer: raise / lower", group: "Mine", kind: "text" },
    { key: "my_need", label: "Need to buy", group: "Mine", kind: "int" },
  );
  cols.splice(cols.findIndex((c) => c.group === "Mine"), 0, ...mineCols);
  // PURCHASE — one column per supplier: its price.
  // Owner 2026-11-12: "in purchase … I just need their list price and the price after the cushion."
  for (const v of buyV) {
    cols.push({ key: `v:${v.id}:price`, label: "List price", group: vendorLabel(v), kind: "money" });
    cols.push({ key: `v:${v.id}:net`, label: "Cushion", group: vendorLabel(v), kind: "money" });
    // Formula input (never on screen by default): the $ cushion, so "Cushion" (list − cushion) is a live Excel formula.
    cols.push({ key: `v:${v.id}:cush`, label: "Cushion $", group: vendorLabel(v), kind: "money" });
  }
  // TRADING — two columns per supplier: their price, and their cost = (their price − cushion) less the % they earn.
  for (const v of buyV) {
    // Owner 2026-11-12: "the data from each vendor should only really be the price of the vendor's list, the approx
    // profit they earn and the price I approximately need to sell to them."
    cols.push({ key: `t:${v.id}:list`, label: "Their list price", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
    cols.push({ key: `t:${v.id}:earn`, label: "They earn ≈", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
    cols.push({ key: `t:${v.id}:cost`, label: "Sell to them ≈", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
    // Formula inputs (never on screen by default): their cushion and the % I estimate they earn, so "Sell to them ≈"
    // and "They earn ≈" are live Excel formulas — change the % in Excel and their cost follows (owner 2026-11-15).
    cols.push({ key: `t:${v.id}:cushion`, label: "Their cushion", group: `Trade · ${vendorLabel(v)}`, kind: "money" });
    cols.push({ key: `t:${v.id}:pct`, label: "They earn % (my estimate)", group: `Trade · ${vendorLabel(v)}`, kind: "pct" });
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
    cols.push({ key: `s:${v.id}:diff`, label: "Their real − me $", group: g, kind: "money" });
    cols.push({ key: `s:${v.id}:diff_pct`, label: "Their real − me %", group: g, kind: "pct" });
    cols.push({ key: `s:${v.id}:action`, label: "Reduce / raise", group: g, kind: "text" });
  }
  // COMPETITION (owner 2026-11-15 13:32 CT): reverse-engineer each competitor's cost from THEIR OWN list — "their list
  // price minus the cushion … I estimate their margin and it should be showing what it should cost them approximately.
  // It is not based on where they are purchasing." Same build as Trading: list → cushion → sales price → × (1 − the
  // margin I estimate) = their cost ≈ → what they earn. The margin is the one typed on the grid (else Rules' store %).
  // (Replaces the 11-12 build that took the cheapest SUPPLIER list instead of the competitor's own price.)
  for (const v of sellV) {
    const g = `Margin · ${vendorLabel(v)}`;
    cols.push({ key: `c:${v.id}:price`, label: "Their list price", group: g, kind: "money" });
    cols.push({ key: `c:${v.id}:cushion`, label: "Cushion", group: g, kind: "money" });
    cols.push({ key: `c:${v.id}:sales`, label: "Their sales price", group: g, kind: "money" });
    cols.push({ key: `c:${v.id}:margin`, label: "Their margin % (my estimate)", group: g, kind: "pct" });
    cols.push({ key: `c:${v.id}:cost`, label: "Their cost ≈", group: g, kind: "money" });
    cols.push({ key: `c:${v.id}:earn`, label: "They earn ≈", group: g, kind: "money" });
  }

  // LIST ANALYSIS columns — the owner's format, his groups and headers in his order.
  const minMargin = opts.targetPct ?? 15;
  const cGroup = `COMPETITOR · ${compV.length === 1 ? vendorLabel(compV[0]) : "lowest sales price"}`;
  const A = (key: string, label: string, group: string, kind: GridCol["kind"]): GridCol => ({ key: `a:${key}`, label, group, kind });
  cols.push(
    // Owner 2026-11-14 17:07 CT: one description per side, no repeats — NAME is MY description (my list's own wording).
    A("upc", "UPC", "ITEM", "text"), A("sku", "SKU", "ITEM", "text"), A("brand", "BRAND", "ITEM", "text"), A("name", "MY DESCRIPTION", "ITEM", "text"),
    A("size", "SIZE", "ITEM", "int"), A("type", "TYPE", "ITEM", "text"), A("kind", "KIND", "ITEM", "text"),
    // Owner 2026-11-14: "after kind, show esperanza description etc so i can match here".
    // Owner 2026-11-14 16:57 CT: "my description from my list and then in 1 row the description from the competition"
    // — just the two descriptions side by side to verify the items are the same, the competitor, the match state
    // and the box to confirm or correct it. Nothing else.
    // The competitor's description IS the match box: it shows the line linked now, or the suggestion, and is searched
    // and confirmed in place (owner 17:07: "shouldn't that be in the same competitor description box so it is not redundant").
    A("c_desc", "COMPETITOR DESCRIPTION", "MATCH", "text"),
    // Owner 2026-11-14 17:34 CT: the competitor's description stays exactly as written; beside it the BRAND the engine
    // read from it, so every brand reading can be checked (blank = the engine could not read one).
    A("c_brand", "COMPETITOR BRAND", "MATCH", "text"), A("c_vendor", "Competitor", "MATCH", "text"), A("match", "Match", "MATCH", "text"),
    A("purch_date", "PURCH DATE", "SALES", "text"), A("qty", "QTY", "SALES", "int"), A("last_cost", "LAST COST", "SALES", "money"),
    A("sold", "SOLD", "SALES", "int"), A("inv_qty", "Inv Qty", "SALES", "int"), A("stores", "STORES", "SALES", "int"), A("margin", "Margin", "SALES", "pct"), A("markup", "Markup", "SALES", "pct"),
    A("offer", "OFFER PRICE", "SALES", "money"), A("esp", "Esperanza Price", "SALES", "money"), A("low_sales", "Lowest Sales Price", "SALES", "money"),
    A("min_buy", "Min Purchase Price to match la esperanza", "Purchases", "money"), A("min_margin", "Min Margin", "Purchases", "pct"),
    A("low_vendor", "Lowest Vendor", "Purchases", "text"), A("low_price", "Lowest Price", "Purchases", "money"),
    A("buy_check", "Lowest vendor ≤ min purchase?", "Purchases", "text"),
    A("offer2", "OFFER PRICE", "Analysis", "money"), A("esp2", "Esperanza Price", "Analysis", "money"), A("under_by", "Cheaper By", "Analysis", "money"),
    A("under_pct", "Cheaper %", "Analysis", "pct"), A("can_inc", "Can Increase %", "Analysis", "pct"), A("new_margin", "New Margin.", "Analysis", "pct"),
    A("over_by", "More Expensive By", "Analysis", "money"), A("lower_pct", "Lower % to Match", "Analysis", "pct"),
    A("advice", "RECOMMENDATION", "Analysis", "text"),
    A("c_list", "LIST PRICE", cGroup, "money"), A("c_cushion", "CUSHION", cGroup, "money"), A("c_sales", "SALES PRICE", cGroup, "money"),
  );
  const vName = new Map(vendors.map((v) => [v.id, vendorLabel(v)]));
  const rows: GridRow[] = [];
  // Speed (owner 2026-11-16 "i need this to work fast"; measured on the live data: 23,984 items × 60 vendor slots walked
  // 5 times per item on every rebuild): each item walks only the vendors that carry it, in the same vendor order, so
  // every "first lowest", ranking and list reads exactly as before.
  const buyIdx = new Map(buyV.map((v, i) => [v.id, i]));
  const sellIdx = new Map(sellV.map((v, i) => [v.id, i]));
  const present = (ids: Iterable<string>, idx: Map<string, number>, list: VendorRow[]): VendorRow[] => {
    const at: number[] = [];
    for (const id of ids) { const i = idx.get(id); if (i !== undefined) at.push(i); }
    return at.sort((a, b) => a - b).map((i) => list[i]);
  };
  let _n = 0;
  for (const it of items.rows) {
    if (++_n % 2000 === 0) await yieldToLoop();
    const offersMap = byItem.get(it.id) ?? new Map();
    const presBuy = present(offersMap.keys(), buyIdx, buyV);
    const presSell = present(offersMap.keys(), sellIdx, sellV);
    const row: GridRow = {
      id: it.id, code: it.internal_code, upc: it.upcs?.[0] ?? null, upc_count: it.upcs?.length ?? 0, brand: it.brand, name: it.name,
      size_ml: it.size_ml == null ? null : Number(it.size_ml), conc: it.conc, gender: it.gender, category: categoryOf(it.gender, it.flags), flags: it.flags.join(" "), display_name: it.display_name,
      upcs: (it.upcs ?? []).join(" "),
      line_text: [...(lineText.get(it.id) ?? [])].join(" | "),
    };
    const offers = presBuy.map((v) => ({
      vendorId: v.id, listedCents: offersMap.get(v.id)!.price,
      cushionLoCents: v.cushion_lo_cents ?? rules.cushion_lo_cents, cushionHiCents: v.cushion_hi_cents ?? rules.cushion_hi_cents,
      freightLoCents: v.freight_lo_cents ?? rules.freight_lo_cents, freightHiCents: v.freight_hi_cents ?? rules.freight_hi_cents,
    }));
    const ranked = rankOffers(offers);
    for (const o of ranked) {
      row[`v:${o.vendorId}:price`] = o.listedCents;
      row[`v:${o.vendorId}:net`] = Math.max(0, o.listedCents - o.cushionLoCents);
      row[`v:${o.vendorId}:cush`] = o.cushionLoCents;
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
    // An inventory file exists (any item): then it is the stock — an item not on it has none on hand.
    const invUploaded = hasInv;
    // My inventory file's last cost wins; else the cost I typed on the desk. Average cost: only what I typed.
    const typed = typedCost.get(it.id);
    if (myCost == null && typed?.last_cost_cents != null) myCost = typed.last_cost_cents;
    const myAvg = typed?.avg_cost_cents ?? null;
    // No inventory file yet: the quantity on my offer list IS my stock (owner 2026-11-14). Never a guessed number.
    if (!invUploaded && offerQtySum.has(it.id)) myQty = offerQtySum.get(it.id)!;
    row.my_offer_desc = myOfferDesc;
    row.my_purchase_date = myPurch;
    row.my_qty_purchased = myQtyPurch;
    row.my_qty_sold = mySold;
    row.my_sku = mySku;
    row.my_qty = myQty;
    row.my_last_cost = myCost;
    row.my_avg_cost = myAvg;
    row.my_offer_price = myOffer;
    row.in_offer = myOffer != null ? 1 : 0;
    row.in_inventory = myQty != null ? 1 : 0;
    // Need to buy: on my offer list and short in stock — only when a real inventory file exists (owner 2026-11-14:
    // no purchase quantities are recommended without stock data).
    row.my_need = myOffer != null && invUploaded ? Math.max(0, (offerQty ?? 1) - (myQty ?? 0)) : null;
    let low: number | null = null, lowAt: string | null = null;
    // List analysis · Purchases: the cheapest supplier for the item (Lowest Vendor / Lowest Price) — my buying side.
    let lowList: number | null = null, lowListAt: string | null = null;
    for (const v of presBuy) { const p = offersMap.get(v.id)?.price; if (p != null && (lowList == null || p < lowList)) { lowList = p; lowListAt = vendorLabel(v); } }
    for (const v of presSell) {
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
      // Competition: their list − cushion = their sales price; × (1 − my estimate of their margin) = their cost ≈.
      const compMargin = earnTyped ?? (v.earn_pct == null ? rules.store_earn_pct : Number(v.earn_pct));
      const compCost = Math.round(costFromPrice(real, compMargin, "margin"));
      row[`c:${v.id}:price`] = p;
      row[`c:${v.id}:cushion`] = cushion;
      row[`c:${v.id}:sales`] = real;
      row[`c:${v.id}:margin`] = compMargin;
      row[`c:${v.id}:cost`] = compCost;
      row[`c:${v.id}:earn`] = real - compCost;
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
    let cBest: CompBest | null = null;
    for (const v of presSell) {
      if (!compIds.has(v.id)) continue;
      const real = row[`s:${v.id}:real`] as number | undefined;
      if (real == null) continue;
      if (!cBest || real < cBest.real) cBest = { list: row[`s:${v.id}:price`] as number, cushion: row[`s:${v.id}:cushion`] as number, real, desc: (row[`s:${v.id}:desc`] as string | null) ?? null, vendor: vendorLabel(v) };
    }
    anByItem.set(it.id, { cBest, lowVendor: lowListAt, lowPrice: lowList });
    Object.assign(row, analysisFields({
      upc: row.upc as string | null, sku: mySku, brand: it.brand, name: it.name, size: row.size_ml as number | null, type: it.conc || null, gender: it.gender,
      purchDate: myPurch, qtyPurch: myQtyPurch, cost: myCost, sold: mySold, invQty: myQty, offer: myOffer, comp: cBest,
      lowVendor: lowListAt, lowPrice: lowList, minMargin, myDesc: myOfferDesc,
    }));
    // My offer price against the lowest competitor (owner 2026-11-13: "my wholesale prices … compare in wholesale and
    // with other vendors"). Positive gap = my offer is under the cheapest competitor.
    // The margin my offer price already carries (owner 2026-11-13: "my list already has margin … 6 percent"):
    // (offer − my cost) ÷ offer, my cost = my inventory's last cost, else the cheapest supplier landed cost.
    // Measured, never assumed — no margin is added on top of my offer price anywhere.
    // Owner 2026-11-14: "where are you getting my cost from? i never uploaded my current cost." Only my inventory's
    // last cost counts as my cost — never a supplier price standing in for it.
    Object.assign(row, myPriceMath(myOffer, myCost, myAvg, lowList));
    row.low_buy_price = lowList;
    row.low_buy_vendor = lowListAt;
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
    for (const v of presBuy) {
      const theirs = offersMap.get(v.id)?.price;
      if (theirs == null) continue;
      const earn = earnTyped ?? (v.earn_pct == null ? rules.vendor_earn_pct : Number(v.earn_pct));
      const cushion = v.cushion_hi_cents ?? rules.cushion_hi_cents;
      const theirCost = Math.round(costFromPrice(Math.max(0, theirs - cushion), earn, "margin"));
      row[`t:${v.id}:list`] = theirs;
      row[`t:${v.id}:cost`] = theirCost;
      // What they make on it: their list price less the cushion they give, less what they pay (= what I sell at).
      row[`t:${v.id}:earn`] = Math.max(0, theirs - cushion) - theirCost;
      row[`t:${v.id}:cushion`] = cushion;
      row[`t:${v.id}:pct`] = earn;
      const mine = row.target_price_margin as number | undefined;
      if (mine != null && mine <= theirCost) beats.push(vendorLabel(v));
    }
    row.trade_beats = beats.length ? beats.join(", ") : null;
    if (low != null) row.target_max_cost = costFromPrice(low, target, "margin");
    // Every vendor (buy or Laredo store) that has a price for this item — the Vendor filter reads it; not a column.
    row.carried_by = [...presBuy, ...presSell].filter((v) => row[`v:${v.id}:price`] != null || row[`s:${v.id}:price`] != null).map((v) => v.name).join("\n");
    rows.push(row);
  }
  const { myLines, theirLines } = await buildAnalysisLines(c, { rows, items: items.rows, myLineQ: myLineQ.rows, theirLineQ: theirLineQ.rows, anByItem, vendors, rules, minMargin });
  const _result: GridPayload = { cols, rows, rules, vendors, target_pct: target, earn_pct: earnTyped ?? rules.vendor_earn_pct, _vk: _cacheKey, myLines, theirLines };
  // Without a data fingerprint the build is shared by the requests already waiting on it, but never remembered.
  if (!_cacheKey.includes("|nosig|")) _gridCache.set(_cacheKey, _result);
  return _result;
}

/** Level-2 view cache: sorted+filtered rows + zero-picks facets cached per (data version, view, mine, sort, dir).
 *  After a cache hit, per-request work is: searchRows (if q) + filterFacets (if picks) + slice only. */
/** LIST ANALYSIS lines (owner 2026-11-14): "a box to select if i want to view their list or just my list … if i select
 *  mine then i will have all the data from only my list showing and matches to and pricing of their items … if i
 *  select their list then it will be showing all esperanzas or any other competitors full list … a filter so it can
 *  show only those items that are matched … or we have in common". One row per LINE on each side, each carrying its
 *  match state and — when not matched — the one-click candidates to link it right there (the same confirmRow the
 *  Review tab uses; nothing links without the owner's click). */
async function buildAnalysisLines(c: PoolClient, x: {
  rows: GridRow[]; items: Array<{ id: string; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; display_name: string }>;
  myLineQ: Array<{ id: string; item_id: string | null; description: string; upc: string | null; sku: string | null; brand: string | null; size_text: string | null; price_cents: number | null; qty: number | null; match_status: string; suggestions: Array<{ item_id: string; display_name: string; score: number; why?: string }> | null }>;
  theirLineQ: Array<{ id: string; vendor_id: string; item_id: string | null; description: string; brand: string | null; size_text: string | null; gender_override: string | null; price_cents: number | null; match_status: string }>;
  anByItem: Map<string, { cBest: CompBest | null; lowVendor: string | null; lowPrice: number | null }>;
  vendors: VendorRow[]; rules: DeskRules; minMargin: number;
}): Promise<{ myLines: GridRow[]; theirLines: GridRow[] }> {
  const rowById = new Map(x.rows.map((r) => [String(r.id), r]));
  const itemById = new Map(x.items.map((i) => [i.id, i]));
  const vLabel = new Map(x.vendors.map((v) => [v.id, vendorLabel(v)]));
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const aliases = { ...BUILTIN_BRAND_ALIASES, ...Object.fromEntries(ba.rows.map((a) => [a.alias, a.brand])) };
  const toOfferItem = (i: { id: string; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; display_name: string }): OfferItem => (
    { id: i.id, brand: i.brand, name: i.name, size_ml: i.size_ml == null ? null : Number(i.size_ml), conc: i.conc || null, gender: i.gender || null, flags: i.flags, display_name: i.display_name });
  const base = (itemId: string | null, fallbackDesc: string, brand: string | null, sizeText: string | null) => {
    const ir = itemId ? rowById.get(itemId) : undefined;
    if (ir) return { brand: ir.brand, name: ir.name, size_ml: ir.size_ml, conc: ir.conc, gender: ir.gender, category: ir.category };
    const id = identify({ description: fallbackDesc, brand, size: sizeText, gender: null, brandAliases: aliases });
    return { brand: id.brand || null, name: id.nameText || fallbackDesc, size_ml: id.sizeMl, conc: id.conc || null, gender: id.gender || null, category: categoryOf(id.gender, id.flags) };
  };
  // Competitor lines not yet linked to an item on MY list: the pool "my list" rows are proposed from.
  const offerItemIds = new Set(x.myLineQ.map((l) => l.item_id).filter((v): v is string => Boolean(v)));
  // Each competitor line is read ONCE per build and remembered across builds while the brand index is unchanged
  // (cachedIdentity): 42,566 lines × 0.27 ms was 11.6 s, and it was done twice per build (measured 11-16).
  const lineId = (l: { description: string; brand: string | null; size_text: string | null; gender_override: string | null }) =>
    cachedIdentity({ description: l.description, brand: l.brand, size: l.size_text, gender: l.gender_override }, aliases);
  const compPool: CompetitorLine[] = x.theirLineQ.filter((l) => !(l.item_id && offerItemIds.has(l.item_id)) && l.price_cents != null).map((l) => ({
    row_id: l.id, vendor: vLabel.get(l.vendor_id) ?? "", description: l.description, price_cents: l.price_cents!, linked_to: l.item_id ? (itemById.get(l.item_id)?.display_name ?? null) : null,
    id: lineId(l),
  }));
  const brandCache = new Map<string, string | null>();
  // A line that starts with a brand the item master knows ("ANIMALE BLACK M 3.4oz") reads as that brand even when the
  // alias list does not carry it (measured live 11-14: 0 of the first 8 ESPERANZA lines had a brand read). Longest
  // brand first; the line's own words only — never the linked item's brand, so a wrong read stays visible.
  const knownBrands = [...new Set([...x.items.map((i) => i.brand), ...Object.values(aliases)].filter(Boolean))]
    .map((b) => ({ b, w: b.toUpperCase().replace(/[^A-Z0-9&]+/g, " ").trim() })).filter((o) => o.w.length >= 2)
    .concat(Object.entries(aliases).map(([a, b]) => ({ b, w: a.toUpperCase().replace(/[^A-Z0-9&]+/g, " ").trim() })).filter((o) => o.w.length >= 2))
    .sort((a, b) => b.w.length - a.w.length);
  // Bucketed by the brand's first word (a line can only start with a brand whose first word is its own first word),
  // longest first inside each bucket — the same answer as scanning every brand, without scanning every brand per line.
  const brandsByFirst = new Map<string, typeof knownBrands>();
  for (const o of knownBrands) { const f = o.w.split(" ")[0]; (brandsByFirst.get(f) ?? brandsByFirst.set(f, []).get(f)!).push(o); }
  const brandByName = (desc: string): string | null => {
    const d = ` ${desc.toUpperCase().replace(/[^A-Z0-9&]+/g, " ").trim()} `;
    const hit = (brandsByFirst.get(d.trim().split(" ")[0]) ?? []).find((o) => d.startsWith(` ${o.w} `));
    return hit ? canonicalBrand(hit.b, aliases) || hit.b : null;
  };
  const brandRead = (desc: string | null | undefined, brand: string | null = null): string | null => {
    if (!desc) return null;
    const k = `${brand ?? ""}|${desc}`;
    if (!brandCache.has(k)) brandCache.set(k, cachedIdentity({ description: desc, brand, size: null, gender: null }, aliases).brand || brandByName(desc));
    return brandCache.get(k)!;
  };
  const likelyCache = new Map<string, MatchCandidate[]>();
  const likelyFor = (itemId: string): MatchCandidate[] => {
    if (likelyCache.has(itemId)) return likelyCache.get(itemId)!;
    const it = itemById.get(itemId);
    const out = it ? likelyLines(toOfferItem(it), compPool, 5).map((cnd) => ({ row_id: cnd.row_id, item_id: itemId, label: `${cnd.description} · ${cnd.vendor}`, price_cents: cnd.price_cents, why: cnd.why })) : [];
    likelyCache.set(itemId, out);
    return out;
  };
  // My list carries the same bottle once per store (owner 2026-11-14 21:43 CT: "some might be various times because
  // they are in different stores"; measured live: 582 lines = 465 items, 78 items on 2–11 lines). The analysis shows
  // ONE row per item: its stock is the sum of every store's qty, its offer price the lowest line, STORES how many lines.
  // Owner 2026-11-15 07:10 CT: "if an item is repeated various times … it must show the same amount of lines as the
  // list" — every line of my list is its own row (one per store, its own qty and price); STORES says how many lines of
  // my list carry the same item, so the repeats are visible, never merged.
  const { storesByItem } = onePerItem(x.myLineQ);
  const myLines: GridRow[] = x.myLineQ.map((l) => {
    const ir = l.item_id ? rowById.get(l.item_id) : undefined;
    const an = l.item_id ? x.anByItem.get(l.item_id) : undefined;
    const matched = Boolean(an?.cBest);
    const state = !l.item_id ? "Not linked to an item" : matched ? "Matched" : "No competitor line linked";
    const cand: MatchCandidate[] = matched ? [] : l.item_id ? likelyFor(l.item_id)
      : (l.suggestions ?? []).slice(0, 5).map((sg) => ({ row_id: l.id, item_id: sg.item_id, label: sg.display_name, price_cents: null, why: sg.why ?? "" }));
    return {
      id: `m:${l.id}`, line_id: l.id, item_id: l.item_id, ...base(l.item_id, l.description, l.brand, l.size_text),
      ...analysisFields({
        upc: l.upc, sku: l.sku, brand: (ir?.brand as string) ?? null, name: l.description, size: (ir?.size_ml as number) ?? null, type: (ir?.conc as string) || null, gender: (ir?.gender as string) ?? null,
        purchDate: (ir?.my_purchase_date as string) ?? null, qtyPurch: (ir?.my_qty_purchased as number) ?? null, cost: (ir?.my_last_cost as number) ?? null, sold: (ir?.my_qty_sold as number) ?? null,
        invQty: l.qty, offer: l.price_cents, comp: an?.cBest ?? null, lowVendor: an?.lowVendor ?? null, lowPrice: an?.lowPrice ?? null, minMargin: x.minMargin, myDesc: l.description, cBrand: brandRead(an?.cBest?.desc),
      }),
      "a:stores": l.item_id ? (storesByItem.get(l.item_id) ?? 1) : 1,
      "a:match": state, matched: matched ? 1 : 0, cand: cand as unknown as string,
      // What the match box links: an item-less line of mine → to an item; a line of mine with its item → a competitor line.
      link_mode: l.item_id ? "line" : "item", link_row: l.id, link_item: l.item_id,
    } as GridRow;
  });
  // Their list: my offer items proposed for each of their unmatched lines (strict rule, offer-review.ts).
  const myOfferItems = [...offerItemIds].map((id) => itemById.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i)).map(toOfferItem);
  await yieldToLoop();
  const theirLines: GridRow[] = [];
  for (let at = 0; at < x.theirLineQ.length; at += 2000) {
    if (at) await yieldToLoop();
    for (const l of x.theirLineQ.slice(at, at + 2000)) theirLines.push(theirLine(l));
  }
  return { myLines, theirLines };
  function theirLine(l: (typeof x.theirLineQ)[number]): GridRow {
    const ir = l.item_id ? rowById.get(l.item_id) : undefined;
    const onMine = Boolean(l.item_id && offerItemIds.has(l.item_id));
    const p = l.price_cents;
    const cushion = p == null ? null : Math.min(p, tieredCushionCents(p, x.rules.competitor_cushion_tiers));
    const comp: CompBest | null = p == null ? null : { list: p, cushion: cushion!, real: p - cushion!, desc: l.description, vendor: vLabel.get(l.vendor_id) ?? "" };
    const an = l.item_id ? x.anByItem.get(l.item_id) : undefined;
    let cand: MatchCandidate[] = [];
    if (!onMine) {
      const id = lineId(l);
      cand = offerCandidates({ description: l.description, brand: l.brand }, id, myOfferItems, 5).map((o) => ({ row_id: l.id, item_id: o.item_id, label: o.display_name, price_cents: null, why: o.why }));
    }
    return {
      id: `c:${l.id}`, line_id: l.id, item_id: l.item_id, ...base(l.item_id, l.description, l.brand, l.size_text),
      ...analysisFields({
        upc: (ir?.upc as string) ?? null, sku: (ir?.my_sku as string) ?? null, brand: (ir?.brand as string) ?? null, name: onMine ? ((ir?.my_offer_desc as string) ?? null) : null, size: (ir?.size_ml as number) ?? null, type: (ir?.conc as string) || null, gender: (ir?.gender as string) ?? null,
        purchDate: (ir?.my_purchase_date as string) ?? null, qtyPurch: (ir?.my_qty_purchased as number) ?? null, cost: (ir?.my_last_cost as number) ?? null, sold: (ir?.my_qty_sold as number) ?? null,
        invQty: onMine ? ((ir?.my_qty as number) ?? null) : null, offer: onMine ? ((ir?.my_offer_price as number) ?? null) : null, comp, lowVendor: an?.lowVendor ?? null, lowPrice: an?.lowPrice ?? null,
        minMargin: x.minMargin, myDesc: onMine ? ((ir?.my_offer_desc as string) ?? null) : null, cBrand: brandRead(l.description, l.brand),
      }),
      "a:stores": onMine && l.item_id ? (storesByItem.get(l.item_id) ?? null) : null,
      "a:match": onMine ? "Matched" : l.item_id ? "Not on my list" : "Not linked to an item", matched: onMine ? 1 : 0, cand: cand as unknown as string,
      link_mode: "item", link_row: l.id, link_item: l.item_id,
    } as GridRow;
  }
}

/** My list carries the same bottle once per store (measured live: 582 lines = 465 items, 78 items on 2–11 lines).
 *  The analysis keeps EVERY line (owner 2026-11-15 07:10 CT: "same amount of lines as the list"); this gives the store
 *  count per item (storesByItem) and the per-item totals for any view that wants them. */
export function onePerItem<L extends { id: string; item_id: string | null; qty: number | null; price_cents: number | null }>(lines: readonly L[]):
  { lines: Array<L & { stores: number }>; storesByItem: Map<string, number> } {
  const groups = new Map<string, L[]>();
  for (const l of lines) {
    const k = l.item_id ?? `line:${l.id}`;
    const g = groups.get(k);
    if (g) g.push(l); else groups.set(k, [l]);
  }
  const storesByItem = new Map<string, number>();
  const out: Array<L & { stores: number }> = [];
  for (const [k, g] of groups) {
    if (!k.startsWith("line:")) storesByItem.set(k, g.length);
    const qtys = g.map((l) => l.qty).filter((q): q is number => q != null);
    const prices = g.map((l) => l.price_cents).filter((p): p is number => p != null);
    out.push({ ...g[0]!, qty: qtys.length ? qtys.reduce((a, b) => a + b, 0) : null, price_cents: prices.length ? Math.min(...prices) : null, stores: g.length });
  }
  return { lines: out, storesByItem };
}

export type AnalysisBase = "mine" | "theirs";
export type AnalysisMatch = "all" | "matched" | "unmatched";
/** List analysis rows: my list's lines or the competitors' full lists, all / matched (in common) / not matched. */
export function analysisRowsOf(g: Pick<GridPayload, "myLines" | "theirLines">, base: AnalysisBase, match: AnalysisMatch): GridRow[] {
  const src = (base === "theirs" ? g.theirLines : g.myLines) ?? [];
  if (match === "matched") return src.filter((r) => r.matched === 1);
  if (match === "unmatched") return src.filter((r) => r.matched !== 1);
  return src;
}

export function getOrBuildView(
  g: GridPayload,
  view: GridView,
  mine: MineFilter | undefined,
  sort: string | undefined,
  dir: "asc" | "desc",
  base: AnalysisBase = "mine",
  match: AnalysisMatch = "all",
): ViewPayload {
  const key = `${g._vk}|${g.target_pct}|${g.earn_pct}|${view}|${mine ?? ""}|${sort ?? ""}|${dir}|${view === "analysis" ? `${base}|${match}` : ""}`;
  const hit = _viewCache.get(key);
  if (hit) return hit;
  const baseRows = view === "analysis" ? analysisRowsOf(g, base, match) : filterView(filterMine(g.rows, mine), view, mine);
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
  // Owner 2026-11-15 13:32 CT: "the negatives should also be in red … if I need to lower the price or if I'm expensive" —
  // the figure is their real price − my offer: negative = I am more expensive (same sign as the analysis' Over By).
  const diff = realCents - myOfferCents;
  const d = (Math.abs(diff) / 100).toFixed(2);
  const diffPct = realCents > 0 ? Math.round((diff / realCents) * 1000) / 10 : null;
  const ofMine = myOfferCents > 0 ? (Math.round((Math.abs(diff) / myOfferCents) * 1000) / 10).toFixed(1) : null;
  const pctTxt = diffPct == null ? "" : ` (${Math.abs(diffPct).toFixed(1)}%)`;
  if (diff < 0) return { diffCents: diff, diffPct, action: `Over by $${d}${pctTxt} — reduce${ofMine ? ` ${ofMine}%` : ""}` };
  if (diff > 0) return { diffCents: diff, diffPct, action: `Under by $${d}${pctTxt} — room to raise${ofMine ? ` ${ofMine}%` : ""}` };
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
  if (view === "comp") return rows.filter((r) => r.low_sell != null);
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

export type ExportFormula = { target: string; deps: string[]; build: (ref: (key: string) => string) => string };
/** The live Excel formula behind each computed column, written only when every input column is exported too.
 *  Money cells are dollars and % cells are fractions in the workbook, so the formulas are plain arithmetic. */
export function exportFormulas(cols: readonly GridCol[]): ExportFormula[] {
  const have = new Set(cols.map((c) => c.key));
  const out: ExportFormula[] = [];
  const add = (target: string, deps: string[], build: ExportFormula["build"]) => {
    if (have.has(target) && deps.every((d) => have.has(d))) out.push({ target, deps, build });
  };
  // Server money is whole cents (Math.round); ROUND(…,2) keeps the workbook to the cent the screen shows.
  for (const c of cols) {
    const m = /^([sctv]):([^:]+):(price|list)$/.exec(c.key);
    if (!m) continue;
    const id = m[2];
    if (m[1] === "v") {
      // Purchase: "Cushion" = their list price − the cushion that vendor gives.
      add(`v:${id}:net`, [`v:${id}:price`, `v:${id}:cush`], (r) => `MAX(0,${r(`v:${id}:price`)}-${r(`v:${id}:cush`)})`);
    } else if (m[1] === "t") {
      // Trading: sell to them ≈ = (their list − their cushion) × (1 − the % I estimate they earn); they earn = the rest.
      add(`t:${id}:cost`, [`t:${id}:list`, `t:${id}:cushion`, `t:${id}:pct`], (r) => `ROUND(MAX(0,${r(`t:${id}:list`)}-${r(`t:${id}:cushion`)})*(1-${r(`t:${id}:pct`)}),2)`);
      add(`t:${id}:earn`, [`t:${id}:list`, `t:${id}:cushion`, `t:${id}:cost`], (r) => `MAX(0,${r(`t:${id}:list`)}-${r(`t:${id}:cushion`)})-${r(`t:${id}:cost`)}`);
    } else if (m[1] === "s") {
      // Wholesale: real price = list − cushion; me vs real $ = my offer − real; % of real.
      add(`s:${id}:real`, [`s:${id}:price`, `s:${id}:cushion`], (r) => `${r(`s:${id}:price`)}-${r(`s:${id}:cushion`)}`);
      add(`s:${id}:diff`, ["my_offer_price", `s:${id}:real`], (r) => `${r(`s:${id}:real`)}-${r("my_offer_price")}`);
      add(`s:${id}:diff_pct`, [`s:${id}:diff`, `s:${id}:real`], (r) => `IF(${r(`s:${id}:real`)}=0,"",${r(`s:${id}:diff`)}/${r(`s:${id}:real`)})`);
      // Reduce / raise — the screen's sentence (offerVsReal), rebuilt from the cells so it follows a price typed in Excel.
      add(`s:${id}:action`, [`s:${id}:diff`, `s:${id}:real`, "my_offer_price"], (r) => {
        const d = r(`s:${id}:diff`), re = r(`s:${id}:real`), o = r("my_offer_price");
        const pctTxt = `IF(${re}>0," ("&TEXT(ABS(${d})/${re},"0.0%")&")","")`;
        const ofMine = `IF(${o}>0," "&TEXT(ABS(${d})/${o},"0.0%"),"")`;
        return `IF(${d}<0,"Over by "&TEXT(-${d},"$0.00")&${pctTxt}&" — reduce"&${ofMine},IF(${d}>0,"Under by "&TEXT(${d},"$0.00")&${pctTxt}&" — room to raise"&${ofMine},"Same as their real price"))`;
      });
    } else {
      // Competition: sales = their list − cushion; their cost ≈ = sales × (1 − my margin estimate); they earn = sales − cost.
      add(`c:${id}:sales`, [`c:${id}:price`, `c:${id}:cushion`], (r) => `${r(`c:${id}:price`)}-${r(`c:${id}:cushion`)}`);
      add(`c:${id}:cost`, [`c:${id}:sales`, `c:${id}:margin`], (r) => `ROUND(${r(`c:${id}:sales`)}*(1-${r(`c:${id}:margin`)}),2)`);
      add(`c:${id}:earn`, [`c:${id}:sales`, `c:${id}:cost`], (r) => `${r(`c:${id}:sales`)}-${r(`c:${id}:cost`)}`);
    }
  }
  // Mine: my offer against the lowest competitor, my offer margin, my profit at X%, and the raise / lower sentences.
  const action = (gap: string, same: string) => `IF(${gap}>0,"Under by "&TEXT(${gap},"$0.00")&" — can raise",IF(${gap}<0,"Over by "&TEXT(-(${gap}),"$0.00")&" — lower to compete","${same}"))`;
  add("offer_vs_low", ["low_sell", "my_offer_price"], (r) => `${r("low_sell")}-${r("my_offer_price")}`);
  add("offer_action", ["offer_vs_low"], (r) => action(r("offer_vs_low"), "Same as lowest competitor"));
  // Margin / markup on my list price: 0 until the cost is there (owner 2026-11-15), as on screen.
  const marg = (cost: string) => (r: (k: string) => string) => `IF(OR(${r("my_offer_price")}="",${r("my_offer_price")}=0),"",IF(${r(cost)}="",0,(${r("my_offer_price")}-${r(cost)})/${r("my_offer_price")}))`;
  const mark = (cost: string) => (r: (k: string) => string) => `IF(${r("my_offer_price")}="","",IF(OR(${r(cost)}="",${r(cost)}=0),0,(${r("my_offer_price")}-${r(cost)})/${r(cost)}))`;
  add("offer_margin_pct", ["my_offer_price", "my_last_cost"], marg("my_last_cost"));
  add("offer_markup_pct", ["my_offer_price", "my_last_cost"], mark("my_last_cost"));
  add("offer_margin_avg_pct", ["my_offer_price", "my_avg_cost"], marg("my_avg_cost"));
  add("offer_markup_avg_pct", ["my_offer_price", "my_avg_cost"], mark("my_avg_cost"));
  add("offer_profit", ["my_offer_price", "my_last_cost"], (r) => `IF(OR(${r("my_offer_price")}="",${r("my_last_cost")}=""),"",${r("my_offer_price")}-${r("my_last_cost")})`);
  add("buy_margin_pct", ["my_offer_price", "low_buy_price"], (r) => `IF(OR(${r("my_offer_price")}="",${r("my_offer_price")}=0,${r("low_buy_price")}=""),"",(${r("my_offer_price")}-${r("low_buy_price")})/${r("my_offer_price")})`);
  add("buy_markup_pct", ["my_offer_price", "low_buy_price"], (r) => `IF(OR(${r("my_offer_price")}="",${r("low_buy_price")}="",${r("low_buy_price")}=0),"",(${r("my_offer_price")}-${r("low_buy_price")})/${r("low_buy_price")})`);
  add("target_profit", ["target_price_margin", "landed_likely"], (r) => `${r("target_price_margin")}-${r("landed_likely")}`);
  add("target_action", ["low_sell", "target_price_margin"], (r) => action(`(${r("low_sell")}-${r("target_price_margin")})`, "Same as lowest competitor"));
  // List analysis — the owner's PERFUME_ENGINE_FORMATS.xlsx formulas, cell for cell.
  add("a:c_sales", ["a:c_list", "a:c_cushion"], (r) => `${r("a:c_list")}-${r("a:c_cushion")}`);
  add("a:esp", ["a:c_sales"], (r) => `${r("a:c_sales")}`);
  add("a:esp2", ["a:esp"], (r) => `${r("a:esp")}`);
  add("a:offer2", ["a:offer"], (r) => `${r("a:offer")}`);
  add("a:low_sales", ["a:offer", "a:esp"], (r) => `MIN(${r("a:offer")},${r("a:esp")})`);
  add("a:min_buy", ["a:esp", "a:min_margin", "a:offer"], (r) => `IF(AND(${r("a:esp")}<>"",${r("a:offer")}<>"",${r("a:esp")}<${r("a:offer")}),${r("a:esp")}*(1-${r("a:min_margin")}),"")`);
  add("a:buy_check", ["a:min_buy", "a:low_price"], (r) => `IF(${r("a:min_buy")}="","",IF(${r("a:low_price")}="","No supplier price",IF(${r("a:low_price")}<=${r("a:min_buy")},"YES","NO — "&TEXT(${r("a:low_price")}-${r("a:min_buy")},"$0.00")&" over")))`);
  add("a:margin", ["a:offer", "a:last_cost"], (r) => `IF(${r("a:offer")}=0,"",IF(${r("a:last_cost")}="",0,(${r("a:offer")}-${r("a:last_cost")})/${r("a:offer")}))`);
  add("a:markup", ["a:offer", "a:last_cost"], (r) => `IF(OR(${r("a:last_cost")}="",${r("a:last_cost")}=0),0,(${r("a:offer")}-${r("a:last_cost")})/${r("a:last_cost")})`);
  add("a:under_by", ["a:offer", "a:esp"], (r) => `MAX(${r("a:esp")}-${r("a:offer")},0)`);
  add("a:under_pct", ["a:under_by", "a:esp"], (r) => `IF(${r("a:esp")}=0,"",${r("a:under_by")}/${r("a:esp")})`);
  add("a:can_inc", ["a:under_by", "a:offer"], (r) => `IF(${r("a:offer")}=0,"",${r("a:under_by")}/${r("a:offer")})`);
  add("a:new_margin", ["a:esp", "a:last_cost"], (r) => `IF(${r("a:esp")}=0,"",IF(${r("a:last_cost")}="",0,(${r("a:esp")}-${r("a:last_cost")})/${r("a:esp")}))`);
  add("a:over_by", ["a:offer", "a:esp"], (r) => `MIN(${r("a:esp")}-${r("a:offer")},0)`);
  add("a:lower_pct", ["a:over_by", "a:offer"], (r) => `IF(${r("a:offer")}=0,"",-${r("a:over_by")}/${r("a:offer")})`);
  return out;
}

/** One sheet of the view's visible columns, values as real numbers, plus a "How computed" sheet; landed cost,
 *  margin and markup are live Excel formulas so anyone can audit them in Excel. */
/** The columns a set of shown columns needs so every computed one stays a live formula: each formula's inputs,
 *  then their inputs, kept in the grid's own order. Owner 2026-11-14 18:37 CT: "export to excel in the same format
 *  … with the formula in case i need to change anything" — the screen's columns showed computed numbers whose
 *  inputs were hidden, so they exported as plain numbers. */
export function exportColumnsWithInputs(shown: readonly GridCol[], all: readonly GridCol[]): { cols: GridCol[]; added: Set<string> } {
  const want = new Set(shown.map((c) => c.key));
  const forms = exportFormulas(all);
  for (let changed = true; changed;) {
    changed = false;
    for (const f of forms) if (want.has(f.target)) for (const d of f.deps) if (!want.has(d)) { want.add(d); changed = true; }
    for (const [t, deps] of [["landed_likely", ["best_price", "cushion", "freight"]], ["margin", ["low_sell", "landed_likely"]], ["markup", ["low_sell", "landed_likely"]], ["profit", ["low_sell", "landed_likely"]]] as const) {
      if (want.has(t)) for (const d of deps) if (!want.has(d) && all.some((c) => c.key === d)) { want.add(d); changed = true; }
    }
  }
  const shownKeys = new Set(shown.map((c) => c.key));
  const added = new Set([...want].filter((k) => !shownKeys.has(k)));
  // Shown columns first, in the screen's order; the inputs the formulas need after them, in the grid's order.
  return { cols: [...shown, ...all.filter((c) => added.has(c.key))], added };
}

const LOW_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCEFE3" } };
/** The per-vendor columns that compare like with like: every vendor's "List price" (v:*:price), every competitor's "Real
 *  price" (s:*:real) … — one family per (prefix, field), only families with 2+ vendors. Returns column indexes. */
export function priceFamilies(keys: readonly string[], isMoney: (i: number) => boolean): number[][] {
  const fam = new Map<string, number[]>();
  keys.forEach((k, i) => {
    const m = /^([vtsc]):[^:]+:([a-z_]+)$/.exec(k);
    if (!m || !isMoney(i) || /diff|earn|cushion|cush|margin/.test(m[2]!)) return;
    const f = `${m[1]}:${m[2]}`;
    (fam.get(f) ?? fam.set(f, []).get(f)!).push(i);
  });
  return [...fam.values()].filter((x) => x.length >= 2);
}
/** Vendor column groups (v:<id>:…, t:<id>:…, s:<id>:…) with no value on any exported row are left out of the Excel
 *  (owner 2026-11-19 08:14 CT, Trading · sell to my vendors: "just those that do not have price, remove in the export").
 *  Item, mine and analysis columns always stay. */
export function dropEmptyVendorColumns(cols: GridCol[], rows: GridRow[]): GridCol[] {
  const groupKey = (k: string) => { const m = /^([vts]):([^:]+):/.exec(k); return m ? `${m[1]}:${m[2]}` : null; };
  const filled = new Set<string>();
  for (const c of cols) {
    const g = groupKey(c.key);
    if (!g || filled.has(g)) continue;
    if (rows.some((r) => r[c.key] != null && r[c.key] !== "")) filled.add(g);
  }
  return cols.filter((c) => { const g = groupKey(c.key); return !g || filled.has(g); });
}

export async function exportWorkbook(cols0: GridCol[], rows: GridRow[], rules: DeskRules, title: string, added: ReadonlySet<string> = new Set()): Promise<Buffer> {
  const cols = dropEmptyVendorColumns(cols0, rows);
  const wb = new ExcelJS.Workbook();
  wb.creator = "TIO Perfumes price desk";
  const ws = wb.addWorksheet(title.slice(0, 31));
  // The owner's format (PERFUME_ENGINE_FORMATS.xlsx): row 1 the group over its columns, row 2 the column names.
  const groupOf = (c: GridCol) => (added.has(c.key) ? "FORMULA INPUTS" : (c.group || "ITEM").toUpperCase());
  ws.addRow(cols.map(groupOf));
  ws.addRow(cols.map((c) => c.label));
  for (let i = 0; i < cols.length;) {
    let j = i;
    while (j + 1 < cols.length && groupOf(cols[j + 1]!) === groupOf(cols[i]!)) j++;
    if (j > i) ws.mergeCells(1, i + 1, 1, j + 1);
    ws.getCell(1, i + 1).alignment = { horizontal: "center" };
    i = j + 1;
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };
  const lowFamilies = priceFamilies(cols.map((c) => c.key), (i) => cols[i]!.kind === "money");
  ws.views = [{ state: "frozen", ySplit: 2 }];
  const idx = (k: string) => cols.findIndex((c) => c.key === k);
  const L = (i: number) => ws.getColumn(i + 1).letter;
  rows.forEach((r, n) => {
    const excelRow = n + 3;
    const values = cols.map((c) => {
      const v = r[c.key];
      if (v == null) return null;
      // Link-to candidates are a list on screen; in Excel they are their labels, one cell.
      if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" && "label" in x ? String((x as { label: unknown }).label) : String(x))).join("; ") || null;
      if (typeof v === "object") return JSON.stringify(v);
      if (c.kind === "money") return Number(v) / 100;
      if (c.kind === "pct") return Number(v) / 100;
      return v;
    });
    const row = ws.addRow(values);
    // Owner 2026-11-16 16:31 CT: "if on any item there is a lowest item should also be colored in and if many have the same
    // price, then those have the same colors." Per family of vendor columns (every vendor's list price, every vendor's
    // real price …) the lowest is shaded, every tie the same shade.
    for (const fam of lowFamilies) {
      let min: number | null = null;
      for (const i of fam) { const v = values[i]; if (typeof v === "number" && (min == null || v < min)) min = v; }
      if (min == null) continue;
      for (const i of fam) if (values[i] === min) { const cell = row.getCell(i + 1); cell.fill = LOW_FILL; cell.font = { bold: true, color: { argb: "FF14532D" } }; }
    }
    // Live formulas: Est. cost (best supplier) = vendor price − cushion + freight; margin and markup from it.
    const p = idx("best_price"), cu = idx("cushion"), fr = idx("freight"), lk = idx("landed_likely"), lo = idx("low_sell"), mg = idx("margin"), mk = idx("markup"), pf = idx("profit");
    if (p >= 0 && cu >= 0 && fr >= 0 && lk >= 0 && r.best_price != null) {
      row.getCell(lk + 1).value = { formula: `${L(p)}${excelRow}-${L(cu)}${excelRow}+${L(fr)}${excelRow}`, result: Number(r.landed_likely) / 100 };
      if (lo >= 0 && r.low_sell != null) {
        if (pf >= 0) row.getCell(pf + 1).value = { formula: `${L(lo)}${excelRow}-${L(lk)}${excelRow}`, result: Number(r.profit) / 100 };
        if (mg >= 0) row.getCell(mg + 1).value = { formula: `(${L(lo)}${excelRow}-${L(lk)}${excelRow})/${L(lo)}${excelRow}`, result: Number(r.margin) / 100 };
        if (mk >= 0) row.getCell(mk + 1).value = { formula: `(${L(lo)}${excelRow}-${L(lk)}${excelRow})/${L(lk)}${excelRow}`, result: Number(r.markup) / 100 };
      }
    }
    // Every other computed column is a live formula too (owner 2026-11-14: "exported to excel, with formulas").
    for (const f of exportFormulas(cols)) {
      const t = idx(f.target);
      // min purchase / its check are formulas on EVERY row with an offer and an Esperanza price, blank when I am the
      // cheaper one — so changing a price or the margin in Excel brings them in and out (owner 19:03 CT).
      const always = f.target === "a:min_buy" || f.target === "a:buy_check";
      // Margin / Markup / New Margin need LAST COST, which no upload fills yet: the formula is written on every row with
      // an offer (or Esperanza) price and reads blank until a cost is typed (owner's engine: =(O3-J3)/O3 on every row).
      const costLed = f.target === "a:margin" || f.target === "a:markup" || f.target === "a:new_margin";
      if (t < 0 || (r[f.target] == null && !always && !costLed) || f.deps.some((k) => r[k] == null && !(always && (k === "a:min_buy" || k === "a:low_price")) && !(costLed && k === "a:last_cost"))) continue;
      const ref = (k: string) => `${L(idx(k))}${excelRow}`;
      const kind = cols[t]!.kind;
      const result = r[f.target] == null ? "" : kind === "money" || kind === "pct" ? Number(r[f.target]) / 100 : r[f.target];
      row.getCell(t + 1).value = { formula: f.build(ref), result: result as number };
    }
  });
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.kind === "money") col.numFmt = '"$"#,##0.00';
    if (c.kind === "pct") col.numFmt = "0.0%";
    col.width = c.key === "name" ? 40 : c.kind === "text" ? 18 : 13;
  });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
  paintGridLikeTheDesk(ws, cols, rows);
  const how = wb.addWorksheet("How computed");
  for (const line of [
    ["Est. cost (best supplier)", "An estimate, not my cost: cheapest supplier price − low cushion + high freight (the safe number: the smaller discount and the larger freight)"],
    ["My actual cost (last purchase)", "What I really paid — from my inventory file (TIO · My inventory). Blank until that file is uploaded; never a supplier price"],
    ["Purchase · Cushion", "List price − the cushion that vendor gives (its own, else the rule's low cushion)"],
    ["Competition · Their sales price", "Their list price − the cushion tier ($10 and under: $0.25, over $10: $0.50, over $30: $1.00 — set in Rules)"],
    ["Competition · Their cost ≈", "Their sales price × (1 − the margin I estimate they earn) — typed on the grid, else the competitor's own %, else Rules"],
    ["Competition · They earn ≈", "Their sales price − Their cost ≈"],
    ["Trading · They earn ≈", "(Their list price − their cushion) − Sell to them ≈ — what that supplier makes on it"],
    ["Trading · Sell to them ≈", "(Their list price − their cushion) × (1 − the % they earn) — about what that supplier pays, so the most I can sell to them at"],
    ["Mine · My price beats their cost at", "Suppliers whose cost is at or above my price at X% — my offer is good enough for them"],
    ["Mine · Raise / lower", "Lowest competitor − my price at X%: positive = room to raise, negative = lower to compete"],
    ["Sell at X% margin", "Est. cost ÷ (1 − X%) — X is the margin typed on the grid"],
    ["Sell at X% markup", "Est. cost × (1 + X%)"],
    ["Profit at X% margin", "Sell at X% margin − est. cost"],
    ["Most I can pay for X%", "Lowest Laredo list price × (1 − X%) — buy at or under this to still earn X% at Laredo's low price"],
    ["Laredo low − my X% price", "Positive = my X% price is under the lowest Laredo price"],
    ["Closed numbers", `Every computed price rounds ${rules.round_dir} to ${rules.round_step === "75" ? "a price ending in .75" : `$${(Number(rules.round_step) / 100).toFixed(2)}`}`],
    ["Default cushion", `$${(rules.cushion_lo_cents / 100).toFixed(2)} – $${(rules.cushion_hi_cents / 100).toFixed(2)} (each vendor can override)`],
    ["Default freight", `$${(rules.freight_lo_cents / 100).toFixed(2)} – $${(rules.freight_hi_cents / 100).toFixed(2)} per piece`],
  ]) how.addRow(line);
  how.getColumn(1).width = 26; how.getColumn(2).width = 80;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * The workbook carries the desk's colours (owner 2026-11-15: "make sure that the prices esperanza has cheaper are also
 * colored in as in the program, and the negatives are in red … colors everything as it is in the app … always all
 * reports"). One painter for every grid export (every view), mirroring PerfumeDeskPage's cell rules:
 *  - the lower of my offer and the competitor's price (a:offer · a:esp · a:offer2 · a:esp2 = MIN(offer, esp)):
 *    green fill #DCEFE3, bold #14532D — a live conditional rule, so it follows a price typed in Excel;
 *  - every negative money / % figure: red #B91C1C (bold on money) — live rule;
 *  - % at or over 20: bold slate #334155 — live rule (the desk's strong-margin tone);
 *  - Match: matched bold green #1F8A4C, otherwise bold amber #C76A0A;
 *  - tied lowest supplier: slate fill #F1F5F9;
 *  - a heavy slate rule (#64748B) on the first column of every group (Mine, each supplier, each competitor).
 */
export function paintGridLikeTheDesk(ws: ExcelJS.Worksheet, cols: GridCol[], rows: GridRow[]): void {
  const first = 3;
  const last = Math.max(first, rows.length + 2);
  const idx = (k: string) => cols.findIndex((c) => c.key === k);
  const L = (i: number) => ws.getColumn(i + 1).letter;
  const range = (i: number) => `${L(i)}${first}:${L(i)}${last}`;
  const GREEN_FILL = { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: "FFDCEFE3" }, fgColor: { argb: "FFDCEFE3" } };
  let priority = 1;
  const off = idx("a:offer"), esp = idx("a:esp");
  for (const k of ["a:offer", "a:esp", "a:offer2", "a:esp2"]) {
    const i = idx(k);
    if (i < 0 || off < 0 || esp < 0) continue;
    const x = `${L(i)}${first}`, o = `$${L(off)}${first}`, e = `$${L(esp)}${first}`;
    ws.addConditionalFormatting({ ref: range(i), rules: [{ type: "expression", priority: priority++, formulae: [`AND(ISNUMBER(${x}),ISNUMBER(${o}),ISNUMBER(${e}),${x}=MIN(${o},${e}))`], style: { fill: GREEN_FILL, font: { bold: true, color: { argb: "FF14532D" } } } }] });
  }
  cols.forEach((c, i) => {
    if (c.kind !== "money" && c.kind !== "pct") return;
    ws.addConditionalFormatting({ ref: range(i), rules: [{ type: "cellIs", operator: "lessThan", formulae: ["0"], priority: priority++, style: { font: { bold: c.kind === "money", color: { argb: "FFB91C1C" } } } }] });
    if (c.kind === "pct") ws.addConditionalFormatting({ ref: range(i), rules: [{ type: "expression", formulae: [`AND(ISNUMBER(${L(i)}${first}),${L(i)}${first}>=0.2)`], priority: priority++, style: { font: { bold: true, color: { argb: "FF334155" } } } }] });
  });
  // Advice that says I am more expensive / must lower: bold red, as on screen (PerfumeDeskPage: /reduce|lower to
  // compete|more expensive/i) — a live rule, so a formula sentence that flips in Excel flips colour too.
  cols.forEach((c, i) => {
    if (c.kind !== "text") return;
    if (!/action$/.test(c.key) && !rows.some((r) => typeof r[c.key] === "string" && /reduce|lower to compete|more expensive/i.test(r[c.key] as string))) return;
    const x = `${L(i)}${first}`;
    ws.addConditionalFormatting({ ref: range(i), rules: [{ type: "expression", priority: priority++, formulae: [`OR(ISNUMBER(SEARCH("reduce",${x})),ISNUMBER(SEARCH("lower to compete",${x})),ISNUMBER(SEARCH("more expensive",${x})))`], style: { font: { bold: true, color: { argb: "FFB91C1C" } } } }] });
  });
  const match = idx("a:match"), best = idx("best_vendor");
  rows.forEach((r, n) => {
    const row = ws.getRow(n + first);
    if (match >= 0 && r["a:match"] != null) row.getCell(match + 1).font = { bold: true, color: { argb: r.matched === 1 ? "FF1F8A4C" : "FFC76A0A" } };
    if (best >= 0 && r.tied) row.getCell(best + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });
  const seen = new Set<string>();
  cols.forEach((c, i) => {
    if (seen.has(c.group)) return;
    seen.add(c.group);
    if ((c.group || "Item") === "Item") return;
    for (let r = 1; r <= last; r++) {
      const cell = ws.getCell(r, i + 1);
      cell.border = { ...(cell.border ?? {}), left: { style: "medium", color: { argb: "FF64748B" } } };
    }
  });
  for (const r of [1, 2]) ws.getRow(r).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F8FA" } }; });
}

/**
 * One vendor list as an Excel file, line for line, the description EXACTLY as the vendor wrote it, beside the BRAND
 * the engine reads (owner 2026-11-14: "keep the description as it is, but add a brand column so I can confirm the
 * brands … all this in the excel"). Each linked line carries the item it is linked to, that item's brand, a live
 * BRANDS AGREE formula, and how many OTHER vendors sell the same item with the lowest of their prices — so the owner
 * sees, on every upload, whether the list matched and whether the item is shared by 2+ vendors.
 */
export async function exportListWorkbook(c: PoolClient, listId: string): Promise<{ buf: Buffer; fileName: string } | null> {
  const head = await c.query<{ vendor: string; created_at: string }>(
    `SELECT v.name AS vendor, l.list_date::text AS created_at FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id WHERE l.id = $1`, [listId]);
  if (!head.rows[0]) return null;
  await loadNameBrands(c);
  const ba = await c.query<{ alias: string; brand: string }>(`SELECT alias, brand FROM perfume.brand_aliases`);
  const aliases: Record<string, string> = Object.fromEntries(ba.rows.map((r) => [r.alias, r.brand]));
  // Read the line exactly as the match index does: every item-master brand is a known spelling (addItem puts them in
  // the index's alias object), so "RAYHAAN AZUL" reads RAYHAAN here too (measured live 11-15: brand column empty).
  for (const b of (await c.query<{ brand: string }>(`SELECT DISTINCT brand FROM perfume.items WHERE merged_into_id IS NULL AND brand <> ''`)).rows) {
    if (!(b.brand in aliases)) aliases[b.brand] = b.brand;
  }
  const q = await c.query<{
    sheet: string | null; row_no: number | null; description: string; brand: string | null; upc: string | null; sku: string | null; size_text: string | null;
    price_cents: number | null; match_status: string; gender_override: string | null; item_id: string | null; display_name: string | null; item_brand: string | null;
    other_vendors: number; low_other_cents: number | null;
  }>(
    `SELECT r.sheet, r.row_no, r.description, r.brand, r.upc, r.sku, r.size_text, r.price_cents, r.match_status, r.gender_override, r.item_id,
            i.display_name, i.brand AS item_brand,
            COALESCE(o.n, 0)::int AS other_vendors, o.low AS low_other_cents
       FROM perfume.price_list_rows r
       JOIN perfume.price_lists l ON l.id = r.list_id
       LEFT JOIN perfume.items i ON i.id = r.item_id
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT l2.vendor_id) AS n, min(r2.price_cents) AS low
           FROM perfume.price_list_rows r2 JOIN perfume.price_lists l2 ON l2.id = r2.list_id AND l2.voided_at IS NULL
          WHERE r.item_id IS NOT NULL AND r2.item_id = r.item_id AND l2.vendor_id <> l.vendor_id) o ON true
      WHERE r.list_id = $1
      ORDER BY r.sheet NULLS FIRST, r.row_no NULLS LAST, r.id`, [listId]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TIO Perfumes price desk";
  const ws = wb.addWorksheet("List with brand");
  const cols: Array<{ group: string; label: string; width: number }> = [
    { group: "VENDOR LINE (AS WRITTEN)", label: "Row", width: 6 },
    { group: "VENDOR LINE (AS WRITTEN)", label: "DESCRIPTION", width: 60 },
    { group: "VENDOR LINE (AS WRITTEN)", label: "UPC", width: 16 },
    { group: "VENDOR LINE (AS WRITTEN)", label: "SKU", width: 12 },
    { group: "VENDOR LINE (AS WRITTEN)", label: "PRICE", width: 10 },
    { group: "ENGINE READS", label: "BRAND", width: 24 },
    { group: "ENGINE READS", label: "MATCH", width: 11 },
    { group: "LINKED ITEM", label: "LINKED ITEM", width: 48 },
    { group: "LINKED ITEM", label: "ITEM BRAND", width: 24 },
    { group: "LINKED ITEM", label: "BRANDS AGREE", width: 13 },
    { group: "OTHER VENDORS", label: "OTHER VENDORS SELLING IT", width: 14 },
    { group: "OTHER VENDORS", label: "LOWEST OTHER PRICE", width: 12 },
    { group: "OTHER VENDORS", label: "THIS LIST CHEAPER?", width: 12 },
  ];
  ws.addRow(cols.map((x) => x.group));
  ws.addRow(cols.map((x) => x.label));
  for (let i = 0; i < cols.length;) {
    let j = i;
    while (j + 1 < cols.length && cols[j + 1]!.group === cols[i]!.group) j++;
    if (j > i) ws.mergeCells(1, i + 1, 1, j + 1);
    ws.getCell(1, i + 1).alignment = { horizontal: "center" };
    i = j + 1;
  }
  cols.forEach((x, i) => { ws.getColumn(i + 1).width = x.width; });
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 2 }];
  const red = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF8D7DA" } };
  const yellow = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF3CD" } };
  q.rows.forEach((r, n) => {
    const x = n + 3;
    const read = identify({ description: r.description, brand: r.brand, size: r.size_text, gender: r.gender_override, brandAliases: aliases }).brand;
    const itemBrand = r.item_brand ? canonicalBrand(r.item_brand, aliases) : null;
    // A line that names no brand but is linked (by UPC, SKU or the brand-free key) carries its item's brand — shown in
    // italics so the owner sees it came from the link, not from the line's own words.
    const brand = read || itemBrand || "";
    const row = ws.addRow([
      r.row_no ?? n + 1, r.description, r.upc ?? null, r.sku ?? null, r.price_cents == null ? null : r.price_cents / 100,
      brand || null, r.item_id ? "linked" : r.match_status, r.display_name ?? null, itemBrand, null,
      r.item_id ? r.other_vendors : null, r.low_other_cents == null ? null : r.low_other_cents / 100, null,
    ]);
    row.getCell(3).numFmt = "@"; // a UPC is text: leading zeros stay, no 1.2E+11
    if (r.upc) row.getCell(3).value = String(r.upc);
    row.getCell(5).numFmt = "$#,##0.00";
    row.getCell(12).numFmt = "$#,##0.00";
    // Live formulas: the owner corrects a BRAND cell and the check re-reads it.
    row.getCell(10).value = { formula: `IF(I${x}="","",IF(UPPER(TRIM(F${x}))=UPPER(TRIM(I${x})),"YES","NO"))`, result: itemBrand ? (brand === itemBrand ? "YES" : "NO") : "" };
    row.getCell(13).value = {
      formula: `IF(OR(E${x}="",L${x}=""),"",IF(E${x}<L${x},"YES",IF(E${x}=L${x},"SAME","NO")))`,
      result: r.price_cents == null || r.low_other_cents == null ? "" : r.price_cents < r.low_other_cents ? "YES" : r.price_cents === r.low_other_cents ? "SAME" : "NO",
    };
    if (!read && brand) row.getCell(6).font = { italic: true, color: { argb: "FF6B7280" } };
    if (!brand) row.getCell(6).fill = yellow;
    if (itemBrand && brand !== itemBrand) { row.getCell(6).fill = red; row.getCell(9).fill = red; row.getCell(10).fill = red; }
    if (!r.item_id) row.getCell(7).fill = yellow;
  });
  const last = q.rows.length + 2;
  ws.addConditionalFormatting({ ref: `J3:J${Math.max(3, last)}`, rules: [{ type: "containsText", operator: "containsText", text: "NO", priority: 1, style: { fill: red } }] });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, last), column: cols.length } };
  const sum = wb.addWorksheet("Summary");
  sum.addRow(["Vendor", head.rows[0].vendor]);
  sum.addRow(["Lines", { formula: `COUNTA('List with brand'!B3:B${Math.max(3, last)})` }]);
  sum.addRow(["Linked", { formula: `COUNTIF('List with brand'!G3:G${Math.max(3, last)},"linked")` }]);
  sum.addRow(["In review", { formula: `COUNTIF('List with brand'!G3:G${Math.max(3, last)},"review")` }]);
  sum.addRow(["Unmatched", { formula: `COUNTIF('List with brand'!G3:G${Math.max(3, last)},"unmatched")` }]);
  sum.addRow(["No brand read", { formula: `COUNTBLANK('List with brand'!F3:F${Math.max(3, last)})` }]);
  sum.addRow(["Brands disagree", { formula: `COUNTIF('List with brand'!J3:J${Math.max(3, last)},"NO")` }]);
  sum.addRow(["Linked items sold by 1+ other vendor", { formula: `COUNTIF('List with brand'!K3:K${Math.max(3, last)},">=1")` }]);
  sum.addRow(["Linked items sold by 2+ other vendors", { formula: `COUNTIF('List with brand'!K3:K${Math.max(3, last)},">=2")` }]);
  sum.addRow(["This list cheaper than every other vendor", { formula: `COUNTIF('List with brand'!M3:M${Math.max(3, last)},"YES")` }]);
  sum.getColumn(1).width = 42; sum.getColumn(2).width = 40; sum.getColumn(1).font = { bold: true };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const safe = head.rows[0].vendor.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return { buf, fileName: `${safe}-LIST-WITH-BRAND-${new Date().toISOString().slice(0, 10)}.xlsx` };
}
