import { apiRequest, generateIdempotencyKey, resolveApiUrl } from "./client";

/** PERFUME-DESK — owner-only TIO Perfumes price desk. Every amount is integer cents. */
/** True only for the login listed in perfume.desk_users (other Owner-role users get false). */
export function getPerfumeAccess(): Promise<{ allowed: boolean }> {
  return apiRequest<{ allowed: boolean }>("/api/v1/perfume/access");
}
export type PerfumeVendorKind = "buy" | "sell" | "both" | "offer" | "inventory";
/** Owner 2026-11-23 12:32 CT: the desk tabs a vendor's list feeds — purchase, trading, wholesale (toggle buttons). */
export type PerfumeVendorRole = "purchase" | "trading" | "wholesale" | "distributor" | "customer";
/** The desk-tab roles first; then the owner's own tags (2026-11-25 23:41 CT) — Distributor, Customer ("also buys from me"). */
export const PERFUME_VENDOR_ROLES: Array<[PerfumeVendorRole, string]> = [["purchase", "Purchase"], ["trading", "Trading"], ["wholesale", "Wholesale"],
  ["distributor", "Distributor"], ["customer", "Customer"]];
export type PerfumeVendor = {
  id: string;
  name: string;
  /** The owner's column-header abbreviation (PCA, MTZ, NAND, PPW …); the full name when empty. */
  short_name: string | null;
  kind: PerfumeVendorKind;
  roles: PerfumeVendorRole[];
  cushion_lo_cents: number | null;
  cushion_hi_cents: number | null;
  freight_lo_cents: number | null;
  freight_hi_cents: number | null;
  earn_pct: string | null;
  sells_by_box: boolean;
  contact: string | null;
  column_mapping: Record<string, unknown>;
};
export type PerfumeRules = {
  round_step: "1" | "5" | "10" | "25" | "50" | "100" | "75";
  round_dir: "up" | "nearest" | "down";
  cushion_lo_cents: number;
  cushion_hi_cents: number;
  freight_lo_cents: number;
  freight_hi_cents: number;
  vendor_earn_pct: number;
  store_earn_pct: number;
  wholesale_targets_pct: number[];
  /** Cushion by list price for a competitor's cost: highest tier whose over_cents the price exceeds. */
  competitor_cushion_tiers: Array<{ over_cents: number; cushion_cents: number }>;
  /** I match the competitor's price less this (owner 2026-11-20: "the .25 difference"). */
  match_under_cents?: number;
  /** Owner 2026-11-27 15:40 CT: % per margin group — my margin, and what a vendor earns on Trading. null / missing = the tab's %. */
  group_margins?: Partial<Record<PerfumeMarginGroup, number | null>>;
  group_earn?: Partial<Record<PerfumeMarginGroup, number | null>>;
};
export type PerfumeMarginGroup = "new_launch" | "exclusive" | "tester" | "set" | "mini" | "regular";
export const PERFUME_MARGIN_GROUPS: Array<[PerfumeMarginGroup, string]> = [["regular", "Regular"], ["exclusive", "Exclusive"], ["new_launch", "New launch"], ["tester", "Tester"], ["mini", "Mini"], ["set", "Set"]];
export type PerfumeGridCol = { key: string; label: string; group: string; kind: "text" | "money" | "pct" | "int"; /** "List 11/25/2026" — the vendor's list in use. */ sub?: string };
export type PerfumeGridRow = Record<string, string | number | null>;
export type PerfumeGridView = "buy" | "trade" | "wholesale" | "comp" | "analysis" | "all";
export type PerfumeGrid = {
  cols: PerfumeGridCol[];
  rows: PerfumeGridRow[];
  total: number;
  rules: PerfumeRules;
  vendors: PerfumeVendor[];
  /** Type (category), gender and brand options with counts for the current view, search and other picks. */
  /** The margin the "My target" columns were computed at. */
  target_pct?: number;
  /** The % vendors are believed to earn that the Trading columns were computed at. */
  earn_pct?: number;
  facets?: Record<PerfumeFacetKey, Array<{ value: string; count: number }>>;
  measured_at: string;
};
export type PerfumeFacetKey = "category" | "gender" | "brand" | "size" | "vendor" | "group";
export type PerfumeImportRow = {
  sheet?: string | null;
  row_no: number;
  raw?: unknown;
  upc?: string | null;
  sku?: string | null;
  brand?: string | null;
  description: string;
  size_text?: string | null;
  gender?: string | null;
  type?: string | null;
  section?: string | null;
  price: number | string | null;
  qty?: number | string | null;
  case_pack?: number | string | null;
  purchase_date?: string | null;
  qty_purchased?: number | string | null;
  qty_sold?: number | string | null;
  /** My inventory by location: { "008": 12, "011": 5 } (owner 2026-11-20). */
  qty_by_location?: Record<string, number | string> | null;
};
export type PerfumeImportBody = {
  vendor_id: string;
  list_date: string;
  label?: string | null;
  file_name: string;
  source_kind: "xlsx" | "xls" | "csv" | "pdf_text" | "image" | "manual";
  rows_read: number;
  file_price_total_cents: number;
  rows: PerfumeImportRow[];
  /** false = supplement (new arrivals): added next to the vendor's current list instead of replacing it. */
  replaces_current?: boolean;
  /** My own lists: keep every list I have, save this one under its own name and put it in use (switch back any time). */
  save_as_new?: boolean;
};
export type PerfumeImportCheck = {
  rows_read: number;
  rows_saved: number;
  rows_skipped: number;
  price_total_file_cents: number;
  price_total_saved_cents: number;
  totals_match: boolean;
  by_method: Record<string, number>;
  review: number;
  unmatched: number;
  items_created: number;
  /** Items a newer list re-identified (old rule name corrected) or merged into the item that already had that identity. */
  items_renamed?: number;
  items_merged?: number;
  /** UPCs this file prints on two different products — not trusted for those lines. */
  upcs_on_two_products?: number;
};
export type PerfumeList = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  kind: PerfumeVendorKind;
  list_date: string;
  label: string | null;
  file_name: string;
  source_kind: string;
  rows_read: number;
  rows_saved: number;
  rows_skipped: number;
  price_total_file_cents: string;
  price_total_saved_cents: string;
  is_current: boolean;
  imported_at: string;
  matched: number;
  review: number;
  unmatched: number;
};
export type PerfumeSuggestion = { item_id: string; display_name: string; score: number; why: string };
export type PerfumeReviewRow = {
  id: string;
  /** Narrowed to my offer list: the offer item this line most likely is. */
  for_my_item?: string | null;
  /** My own offer-list wording for that item. */
  for_my_desc?: string | null;
  list_id: string;
  /** perfume.vendors id — the Vendor cell opens that vendor's card on the Lists tab. */
  vendor_id: string;
  vendor_name: string;
  row_no: number;
  upc: string | null;
  sku: string | null;
  brand: string | null;
  description: string;
  /** The vendor line split into columns by the server's identity engine (brand canonical: CK → CALVIN KLEIN). */
  brand_name?: string | null;
  model?: string | null;
  size_ml?: number | null;
  conc?: string | null;
  gender?: string | null;
  flags?: string;
  /** Women / Men / Unisex / Set … / Tester … / Cosmetics / Various — from gender + flags (server). */
  category?: string;
  country?: string | null;
  case_pack?: number | null;
  price_cents: number;
  match_status: "review" | "unmatched";
  suggestions: PerfumeSuggestion[];
};
export type PerfumeItemHit = { id: string; display_name: string; internal_code: string | null; upcs: string[] | null };

export const getPerfumeRules = () => apiRequest<PerfumeRules>("/api/v1/perfume/rules");
export const putPerfumeRules = (patch: Partial<PerfumeRules>) => apiRequest<PerfumeRules>("/api/v1/perfume/rules", { method: "PUT", body: patch });
export const listPerfumeVendors = () => apiRequest<{ vendors: PerfumeVendor[] }>("/api/v1/perfume/vendors");
export const savePerfumeVendor = (v: Omit<Partial<PerfumeVendor>, "earn_pct"> & { name: string; earn_pct?: number | null }) =>
  apiRequest<PerfumeVendor>("/api/v1/perfume/vendors", { method: "POST", body: v });
export const listPerfumeLists = () => apiRequest<{ lists: PerfumeList[] }>("/api/v1/perfume/lists");
/** One picture sent to the reader (already shrunk to JPEG in the browser). */
export type PerfumePicture = { name: string; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data_base64: string };
export type PerfumeExtractedLine = {
  image: number; image_name: string; brand: string | null; description: string; size: string | null; type: string | null;
  gender: string | null; price: string | null; qty: string | null; section: string | null; note: string | null;
};
/** Reads up to 6 pictures (offer photos / scanned list pages). Writes nothing — the owner approves the lines. */
export const extractPerfumeLines = (images: PerfumePicture[]) =>
  apiRequest<{ lines: PerfumeExtractedLine[]; model_id: string; images: number }>("/api/v1/perfume/extract", { method: "POST", body: { images } });
export const previewPerfumeImport = (b: PerfumeImportBody) => apiRequest<PerfumeImportCheck>("/api/v1/perfume/lists/preview", { method: "POST", body: b });
export const savePerfumeImport = (b: PerfumeImportBody) =>
  apiRequest<{ list_id: string; check: PerfumeImportCheck }>("/api/v1/perfume/lists", { method: "POST", body: b });
export const setPerfumeListCurrent = (id: string, current: boolean) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/lists/${id}/current`, { method: "POST", body: { current } });
/** One saved list of mine (offer / inventory): every live list of that vendor sharing one name. */
export type PerfumeSavedList = { key: string; vendor_id: string; vendor_name: string; kind: "offer" | "inventory"; number: number; name: string;
  list_ids: string[]; files: string[]; first_date: string; last_date: string; lines: number; in_use: boolean; imported_at: string };
export const listPerfumeSavedLists = () => apiRequest<{ saved: PerfumeSavedList[] }>("/api/v1/perfume/mine/saved-lists");
export const activatePerfumeSavedList = (vendorId: string, key: string | null) =>
  apiRequest<{ ok: true; in_use: number }>("/api/v1/perfume/mine/saved-lists/use", { method: "POST", body: { vendor_id: vendorId, key } });
/** The owner's locations register (owner 2026-11-20 20:38 CT): store / bodega number + name. */
export type PerfumeLocation = { code: string; name: string; sort_order: number; active: boolean; updated_at: string };
export const listPerfumeLocations = () => apiRequest<{ locations: PerfumeLocation[] }>("/api/v1/perfume/locations");
export const savePerfumeLocation = (b: { code: string; name: string; sort_order?: number | null; active?: boolean | null }) =>
  apiRequest<{ location: PerfumeLocation }>("/api/v1/perfume/locations", { method: "POST", body: b });
export const voidPerfumeList = (id: string, reason: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/lists/${id}/void`, { method: "POST", body: { reason } });
/** A voided list (owner 2026-11-27 08:51 CT: "restore buttons"): every void and restore is kept in perfume.price_list_events. */
export type PerfumeVoidedList = { id: string; vendor_id: string; vendor_name: string; list_date: string; label: string | null; file_name: string;
  rows_saved: number; voided_at: string; void_reason: string; linked: number; vendor_has_current: boolean };
export const listPerfumeVoidedLists = () => apiRequest<{ lists: PerfumeVoidedList[] }>("/api/v1/perfume/lists/voided");
export const restorePerfumeList = (id: string, reason: string, replace: boolean) =>
  apiRequest<{ ok: true; voided_now: string[]; is_current: boolean }>(`/api/v1/perfume/lists/${id}/restore`, { method: "POST", body: { reason, replace } });
export type PerfumeReviewFilter = { listIds?: string[]; q?: string; status?: "review" | "unmatched" | null; mine?: "offer" | null; gender?: string[]; conc?: string[]; kind?: string[]; category?: string[]; brand?: string[]; suggest?: PerfumeSuggestBucket | null };
/** Owner 11-15 19:24 CT: lines with a suggestion / best ≥95/90/80/70% alike / no suggestion. */
export type PerfumeSuggestBucket = "any" | "95" | "90" | "80" | "70" | "none";
/** One choice of a Review line filter and how many waiting lines it shows (with every other filter applied). */
export type PerfumeReviewFacet = { value: string; count: number };
export type PerfumeReviewFacets = { gender: PerfumeReviewFacet[]; conc: PerfumeReviewFacet[]; kind: PerfumeReviewFacet[]; category: PerfumeReviewFacet[]; brand: PerfumeReviewFacet[]; suggest?: PerfumeReviewFacet[] };
export const getPerfumeReview = (offset = 0, limit = 100, f: PerfumeReviewFilter = {}) => {
  const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (f.listIds?.length) p.set("list_ids", f.listIds.join(","));
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.mine) p.set("mine", f.mine);
  if (f.status) p.set("status", f.status);
  if (f.suggest) p.set("suggest", f.suggest);
  for (const k of ["gender", "conc", "kind", "category", "brand"] as const) if (f[k]?.length) p.set(k, f[k]!.join(","));
  return apiRequest<{ rows: PerfumeReviewRow[]; total: number; facets?: PerfumeReviewFacets }>(`/api/v1/perfume/review?${p.toString()}`);
};
export type PerfumeBulkAction =
  | { action: "confirm_best"; row_ids: string[] }
  | { action: "link_item"; row_ids: string[]; item_id: string }
  | { action: "create_new"; row_ids: string[] }
  | { action: "set_gender"; row_ids: string[]; gender: "M" | "W" | "U" };
export type PerfumeBulkResult = { rows: number; linked: number; items_created: number; now_matched: number; skipped: Array<{ row_id: string; reason: string }> };
/** Owner 11-12: one spelling per brand — respelled twins merge into the canonical item. Idempotent. */
export const canonicalizePerfumeBrands = () =>
  apiRequest<{ checked: number; renamed: number; merged: number; brands: Record<string, string> }>("/api/v1/perfume/items/canonicalize-brands", { method: "POST", body: {} });
/** Re-runs the matching engine over every line still in Review (new suggestions, new links). */
export type PerfumeRematchJob = { state: "idle" | "running" | "done" | "failed"; started_at: string | null; finished_at: string | null; result: Record<string, number> | null; error: string | null };
/** Starts the Review rematch (it runs in the background, minutes) and waits for it — polling every 3 s. */
export async function rematchPerfumeReview(): Promise<Record<string, number>> {
  const started = await apiRequest<PerfumeRematchJob>("/api/v1/perfume/review/rematch", { method: "POST", body: {} });
  // The API runs on more than one server and the job lives on the one that started it (measured 02:03Z: GET answered
  // "idle" 7 times out of 8). Keep asking until the server running THIS job (same started_at) says done or failed.
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const job = await apiRequest<PerfumeRematchJob>("/api/v1/perfume/review/rematch");
    if (job.started_at !== started.started_at) continue;
    if (job.state === "failed") throw new Error(job.error ?? "Rematch failed");
    if (job.state === "done" && job.result) return job.result;
  }
  throw new Error("Rematch still running — check again in a minute");
}
export const bulkPerfumeReview = (b: PerfumeBulkAction) => apiRequest<PerfumeBulkResult>("/api/v1/perfume/rows/bulk", { method: "POST", body: b });
export const confirmPerfumeRow = (rowId: string, target: { item_id: string } | { create_new: true }) =>
  apiRequest<{ item_id: string; rows_linked: number }>(`/api/v1/perfume/rows/${rowId}/confirm`, { method: "POST", body: target });
/** Owner 2026-11-17: type my list price (my current offer list — one line, or every line of the item) or my last / avg
 *  cost (per item) right on the desk. 409 not_on_my_list: the item is not on my offer list. */
export type PerfumeMyPriceField = "offer" | "last_cost" | "avg_cost";
export const setPerfumeMyPrice = (body: { item_id?: string | null; line_id?: string | null; field: PerfumeMyPriceField; cents: number | null }) =>
  apiRequest<{ ok: true; updated: number }>(`/api/v1/perfume/mine/price`, { method: "PUT", body });
/** L.30 item 11: the ticked items' "My price @ my margin" written into my current offer list (one transaction). */
export type PerfumeConfirmPricesResult = { ok: true; updated: number; unchanged: number; not_on_my_list: string[]; no_price: string[]; changes: Array<{ item_id: string; from: number | null; to: number }> };
export const confirmPerfumePrices = (body: { item_ids: string[]; target_pct?: number | null; earn_pct?: number | null }) =>
  apiRequest<PerfumeConfirmPricesResult>(`/api/v1/perfume/mine/confirm-prices`, { method: "POST", body });
/** Match my list ↔ competitor: my offer items with no competitor line linked, and the lines each most likely is. */
export type PerfumeLineCandidate = { row_id: string; vendor: string; description: string; price_cents: number; score: number; why: string; linked_to: string | null };
/** gender: the line being linked is Men (M) or Women (W) — the other gender's bottles are never returned. */
const genderParam = (g: string | null | undefined) => (g === "M" || g === "W" ? `&gender=${g}` : "");
export const searchPerfumeItems = (q: string, gender?: string | null) => apiRequest<{ items: PerfumeItemHit[] }>(`/api/v1/perfume/items/search?q=${encodeURIComponent(q)}${genderParam(gender)}`);
export type PerfumeLineHit = { row_id: string; description: string; vendor: string; price_cents: number | null; linked_to: string | null; gender?: string | null };
export const searchPerfumeLines = (q: string, gender?: string | null) => apiRequest<{ lines: PerfumeLineHit[] }>(`/api/v1/perfume/lines/search?q=${encodeURIComponent(q)}${genderParam(gender)}`);
export const setPerfumeInternalCode = (itemId: string, code: string | null) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/items/${itemId}/internal-code`, { method: "PUT", body: { internal_code: code } });

export function perfumeGridQuery(p: { view: PerfumeGridView; sort?: string; dir?: "asc" | "desc"; q?: string; offset?: number; limit?: number; category?: string[]; gender?: string[]; brand?: string[]; size?: string[]; vendor?: string[]; group?: string[]; target_pct?: number | null; earn_pct?: number | null; mine?: "offer" | "inventory" | "need" | null; carried?: boolean; base?: "mine" | "theirs"; match?: "all" | "matched" | "unmatched"; comps?: string[] }) {
  const s = new URLSearchParams({ view: p.view, dir: p.dir ?? "asc", q: p.q ?? "", offset: String(p.offset ?? 0), limit: String(p.limit ?? 200) });
  if (p.sort) s.set("sort", p.sort);
  for (const k of ["category", "gender", "brand", "size", "vendor", "group"] as const) if (p[k]?.length) s.set(k, p[k]!.join(","));
  if (p.target_pct != null) s.set("target_pct", String(p.target_pct));
  if (p.earn_pct != null) s.set("earn_pct", String(p.earn_pct));
  if (p.mine) s.set("mine", p.mine);
  if (p.carried) s.set("carried", "1");
  if (p.view === "analysis") { s.set("base", p.base ?? "mine"); s.set("match", p.match ?? "all"); }
  if (p.comps?.length) s.set("comps", p.comps.join(","));
  return s;
}
export const getPerfumeGrid = (p: Parameters<typeof perfumeGridQuery>[0]) => apiRequest<PerfumeGrid>(`/api/v1/perfume/grid?${perfumeGridQuery(p).toString()}`);

/** Downloads the Excel workbook the server builds (live formulas for cost, margin and markup). */
export async function downloadPerfumeExcel(p: Parameters<typeof perfumeGridQuery>[0], cols: string[]) {
  const q = perfumeGridQuery({ ...p, offset: 0, limit: 1 });
  if (cols.length) q.set("cols", cols.join(","));
  const res = await fetch(resolveApiUrl(`/api/v1/perfume/export.xlsx?${q.toString()}`), { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "TIO-Perfumes.xlsx";
  const url = URL.createObjectURL(blob);
  // The link must be in the page and the blob must outlive the click: revoking it in the same tick cancels the
  // download in Chrome/Edge before it starts (owner 2026-11-14: "i am not able to export").
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60_000);
}

/** One vendor list as written + the BRAND the engine reads, its link, and vendor coverage (owner 11-14). */
export async function downloadPerfumeListExcel(listId: string) {
  const res = await fetch(resolveApiUrl(`/api/v1/perfume/lists/${encodeURIComponent(listId)}/export.xlsx`), { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "TIO-List.xlsx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60_000);
}

/* ---------------- Mail price lists (owner 2026-11-25 17:29 CT) ---------------- */
/** "AN ENGINE THAT AUTOMATICALLY GOES TO MY MAIL APP, GETS ALL THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW PRICES". */
export type PerfumeMailAccount = { email: string; status: "connected" | "reconnect" | "disconnected"; last_error: string | null; connected_at: string; last_checked_at: string | null; can_send?: boolean; provider?: "google" | "microsoft" };
export type PerfumeMailRule = { id: string; from_address: string; file_text: string | null; vendor_id: string | null; vendor_name: string | null; special: boolean; ignore: boolean; created_at: string };
export type PerfumeMailRun = { id: string; trigger: "schedule" | "manual"; started_at: string; finished_at: string | null; accounts: number; messages_seen: number;
  imported: number; held: number; unassigned: number; failed: number; error: string | null };
export type PerfumeMailFileStatus = "imported" | "held" | "unassigned" | "duplicate" | "failed";
export type PerfumeMailFile = { id: string; account_email: string; file_name: string; sender: string; subject: string | null; received_at: string;
  status: PerfumeMailFileStatus; reason: string | null; vendor_id: string | null; vendor_name: string | null; list_id: string | null; rows_read: number | null;
  rows_saved: number | null; file_total_cents: number | string | null; processed_at: string; list_voided_at: string | null };
export type PerfumeMailSendBatch = { id: string; from_email: string; subject: string; attachment_names: string[]; recipients: number; sent: number;
  skipped: number; failed: number; status: "sending" | "done" | "stopped" | "failed"; error: string | null; started_at: string; finished_at: string | null };
export type PerfumeMailOptout = { email: string; reason: string | null; created_at: string };
export type PerfumeMailSendState = { sender: string; daily_cap: number; sent_last_24h: number; max_recipients: number; max_attachment_bytes: number;
  footer: string; batches: PerfumeMailSendBatch[]; optouts: PerfumeMailOptout[] };
export type PerfumeMailState = { configured: boolean; microsoft_configured?: boolean; microsoft_mailboxes?: string[]; mailboxes: string[]; schedule: string; running: boolean; accounts: PerfumeMailAccount[];
  rules: PerfumeMailRule[]; runs: PerfumeMailRun[]; files: PerfumeMailFile[]; send?: PerfumeMailSendState };
export const getPerfumeMail = () => apiRequest<PerfumeMailState>("/api/v1/perfume/mail");
/** Google sign-in for one TIO mailbox (read-only; jpm@tioperfumes.com also asks for send). A page navigation, not a fetch. */
export function perfumeMailConnectUrl(email: string, send = false, microsoft = false): string {
  if (microsoft) return resolveApiUrl(`/api/v1/perfume/mail/microsoft/connect?${new URLSearchParams({ returnTo: window.location.origin }).toString()}`);
  const q = new URLSearchParams({ email, returnTo: window.location.origin, ...(send ? { send: "1" } : {}) });
  return resolveApiUrl(`/api/v1/perfume/mail/connect?${q.toString()}`);
}
export type PerfumeMailSendBody = { to: string; subject: string; body: string; attachments: Array<{ name: string; mime_type?: string; content_base64: string }> };
export const sendPerfumeMail = (b: PerfumeMailSendBody) =>
  apiRequest<{ batch_id: string; recipients: number }>("/api/v1/perfume/mail/send", { method: "POST", body: b });
export const stopPerfumeMailSend = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/mail/send/${encodeURIComponent(id)}/stop`, { method: "POST", body: {} });
export const addPerfumeMailOptouts = (emails: string, reason?: string) =>
  apiRequest<{ added: number }>("/api/v1/perfume/mail/optouts", { method: "POST", body: { emails, ...(reason ? { reason } : {}) } });
export const removePerfumeMailOptout = (email: string) => apiRequest<{ ok: true }>("/api/v1/perfume/mail/optouts/remove", { method: "POST", body: { email } });
export const disconnectPerfumeMail = (email: string) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/mail/accounts/${encodeURIComponent(email)}/disconnect`, { method: "POST", body: {} });
export const runPerfumeMail = (days?: number) => apiRequest<{ started: true }>("/api/v1/perfume/mail/run", { method: "POST", body: days ? { days } : {} });
export const savePerfumeMailRule = (r: { from_address: string; file_text?: string | null; vendor_id?: string | null; special?: boolean; ignore?: boolean }) =>
  apiRequest<{ id: string }>("/api/v1/perfume/mail/rules", { method: "POST", body: r });
export const switchOffPerfumeMailRule = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/mail/rules/${encodeURIComponent(id)}/off`, { method: "POST", body: {} });
export const importPerfumeMailFile = (id: string, b: { vendor_id?: string; special?: boolean; file_text?: string | null; force?: boolean }) =>
  apiRequest<{ status: PerfumeMailFileStatus; reason?: string | null; rowsSaved?: number | null }>(`/api/v1/perfume/mail/files/${encodeURIComponent(id)}/import`, { method: "POST", body: b });
/** The bytes of one mailed file (the server fetches it from the mailbox). */
export async function fetchPerfumeMailFileBytes(id: string): Promise<Blob> {
  const res = await fetch(resolveApiUrl(`/api/v1/perfume/mail/files/${encodeURIComponent(id)}/download`), { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}
/** An old .xls the engine held: its cells, read in this browser, go back to the engine for the same checks as any mailed list. */
export const sendPerfumeMailXlsCells = (id: string, sheets: Array<{ name: string; cells: Array<Array<string | number | null>> }>) =>
  apiRequest<{ status: PerfumeMailFileStatus; reason?: string | null; rowsSaved?: number | null }>(`/api/v1/perfume/mail/files/${encodeURIComponent(id)}/xls-cells`, { method: "POST", body: { sheets } });
export async function downloadPerfumeMailFile(id: string, fileName: string) {
  const res = await fetch(resolveApiUrl(`/api/v1/perfume/mail/files/${encodeURIComponent(id)}/download`), { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60_000);
}

/* PERFUME-CONTACTS (owner 2026-11-25 22:04 / 22:11 CT) — the contacts database, and the Google business search (22:09 CT). */
export type PerfumeContactRole = "vendor" | "customer" | "both";
export type PerfumeContactCounts = { companies: number; vendors: number; customers: number; both: number; unclassified: number; from_google: number;
  needs_email: number; people: number; with_email: number; phone_only: number;
  /** Owner 2026-11-28 14:30 CT (migration 202617320100): not approved yet = a lead; approved customers / vendors. */
  leads?: number; approved_customers?: number; approved_vendors?: number };
export type PerfumeContactRow = { id: string; name: string; domain: string | null; role: PerfumeContactRole | null; vendor_type: string | null;
  customer_type: string | null; main_category: string | null; categories: string[]; city: string | null; state: string | null; country: string | null;
  phone: string | null; website: string | null; maps_uri: string | null; google_rating: string | null; google_rating_count: number | null;
  status: string; source: string; first_contact_on: string | null; last_email_on: string | null; people: number; with_email: number; how_started: string | null;
  /** The main person of the company (most emails exchanged) — owner 2026-11-28 14:05 CT "which contact is it, the email or telephone". */
  main_contact?: string | null; main_email?: string | null; main_phone?: string | null };
export type PerfumeContactFacet = "country" | "state" | "city" | "category" | "relationship" | "industry" | "tag" | "source" | "how" | "region" | "ctype" | "vtype" | "segment" | "status" | "show" | "reach" | "kind";
export type PerfumeContactList = { counts: PerfumeContactCounts; total: number; limit: number; offset: number; rows: PerfumeContactRow[];
  facets?: Record<PerfumeContactFacet, Array<{ value: string; count: number }>> };
/** Several values per filter box ("|"-separated on the wire — a city name can hold a comma). */
export type PerfumeContactPicks = Partial<Record<"countries" | "states" | "cities" | "categories" | "sources" | "hows" | "regions" | "ctypes" | "vtypes" | "segments" | "statuses" | "shows" | "reach" | "kinds" | "relationships" | "industries" | "tags", string[]>>;
export function listPerfumeContacts(q: { role?: PerfumeContactRole | "none" | "all"; stage?: "lead" | "approved" | "all"; q?: string; source?: string; limit?: number; offset?: number } & PerfumeContactPicks) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join("|")); }
    else if (v != null && v !== "") p.set(k, String(v));
  }
  return apiRequest<PerfumeContactList>(`/api/v1/perfume/contacts?${p.toString()}`);
}
export type PerfumeContactProfile = {
  company: Record<string, unknown> & { id: string; name: string };
  people: Array<{ id: string; name: string | null; email: string | null; phones: string[]; role: PerfumeContactRole | null; how_started: string | null;
    first_contact_on: string | null; last_email_on: string | null; email_count: number | null }>;
  origins: Array<{ id: string; occurred_on: string | null; how: string; source: string; source_url: string | null; detail: string | null; person_name: string | null }>;
};
export const getPerfumeContact = (id: string) => apiRequest<PerfumeContactProfile>(`/api/v1/perfume/contacts/${encodeURIComponent(id)}`);
export type PerfumeGoogleRun = { id: string; kind: "single" | "batch"; status: "running" | "done" | "stopped" | "failed" | "interrupted";
  planned_searches: number; searches_done: number; requests_made: number; results: number; inserted: number; matched: number; skipped_closed: number;
  by_city: Record<string, { searches: number; results: number; inserted: number; matched: number; skipped_closed: number }>;
  query: Record<string, unknown> | null; error: string | null; started_at: string; finished_at: string | null };
export type PerfumeGooglePlan = { configured: boolean; field_mask: string; running: string | null; full_matrix_unlocked: boolean;
  all: { searches: number; maxRequests: number; cities: number }; first_city: { city: string; searches: number; maxRequests: number; cities: number };
  cities: Array<{ city: string; searches: number; max_requests: number }>; runs: PerfumeGoogleRun[] };
export const getPerfumeGooglePlan = () => apiRequest<PerfumeGooglePlan>("/api/v1/perfume/prospects/google-plan");
export type PerfumeGoogleResult = { place_id: string; name: string; address: string | null; city: string | null; state: string | null; country: string | null;
  phone: string | null; website: string | null; maps_uri: string | null; rating: number | null; rating_count: number | null; business_status: string | null;
  outcome: "inserted" | "matched" | "skipped_closed" };
export const perfumeGoogleSearch = (b: { query: string; city?: string; state?: string; country?: string; max?: number }) =>
  apiRequest<{ run_id: string; text_query: string; requests: number; inserted: number; matched: number; skipped_closed: number; results: PerfumeGoogleResult[] }>(
    "/api/v1/perfume/prospects/google-search", { method: "POST", body: b });
export const startPerfumeGoogleRun = (city: string) => apiRequest<{ run_id: string }>("/api/v1/perfume/prospects/google-run", { method: "POST", body: { city } });
export const stopPerfumeGoogleRun = (id: string) => apiRequest<{ stopping: boolean }>(`/api/v1/perfume/prospects/google-run/${encodeURIComponent(id)}/stop`, { method: "POST", body: {} });
export type PerfumeContactImportTally = { records: number; inserted: number; matched: number; by: Record<string, number>; people_inserted: number; people_existing: number; origins: number };
/** Owner 2026-11-27 21:39 CT: delete the selected contacts that are not for the business (a company with business on file is kept, with the reason). */
export type PerfumeContactDeleteResult = { deleted: number; people: number; already_deleted: number; not_found: number; kept: Array<{ id: string; name: string; reason: string }> };
export const deletePerfumeContacts = (ids: string[]) =>
  apiRequest<PerfumeContactDeleteResult>("/api/v1/perfume/contacts/delete", { method: "POST", body: { ids } });
/** Owner 2026-11-28 14:30 CT: a lead becomes a customer / vendor only when approved; "Send back to leads" undoes it. */
export const approvePerfumeContacts = (ids: string[], role: PerfumeContactRole) =>
  apiRequest<{ approved: number; not_found: number }>("/api/v1/perfume/contacts/approve", { method: "POST", body: { ids, role } });
export const unapprovePerfumeContacts = (ids: string[]) =>
  apiRequest<{ sent_back: number; kept: Array<{ id: string; name: string; reason: string }> }>("/api/v1/perfume/contacts/unapprove", { method: "POST", body: { ids } });
export const restorePerfumeContacts = (ids: string[]) =>
  apiRequest<{ restored: number }>("/api/v1/perfume/contacts/restore", { method: "POST", body: { ids } });
/** Owner 2026-11-28 14:24 CT: leads with no email or phone — how many, and the lookup that finds it (Google Places + the company's own website). */
export type PerfumeNoContactInfo = { configured: boolean; total: number; looked_up: number };
export type PerfumeFindContactInfoResult = { looked_up: number; phone: number; website: number; email: number; no_match: number; nothing: number; error: number;
  remaining: { total: number; looked_up: number };
  rows: Array<{ id: string; name: string; result: "phone" | "website" | "email" | "nothing" | "no_match" | "error"; phone?: string | null; website?: string | null; email?: string | null; note?: string }> };
export const getPerfumeNoContactInfo = () => apiRequest<PerfumeNoContactInfo>("/api/v1/perfume/contacts/no-contact-info");
export const findPerfumeContactInfo = (body: { ids?: string[]; limit?: number; since?: string }) =>
  apiRequest<PerfumeFindContactInfoResult>("/api/v1/perfume/contacts/find-contact-info", { method: "POST", body });
export const importPerfumeContacts = (records: unknown[]) =>
  apiRequest<PerfumeContactImportTally>("/api/v1/perfume/contacts/import", { method: "POST", body: { records } });

/* ------------------------------------------------------------------ Trade show planner (owner 2026-11-26 15:56 CT) */
export type PerfumeShow = { id: string; name: string; starts_on: string | null; ends_on: string | null; city: string | null; country: string | null;
  kind: string | null; dates_status: string | null; i_go: boolean; venue: string | null; website: string | null; notes: string | null; source: string | null;
  organizer: string | null; register_url: string | null; contact_email: string | null; contact_phone: string | null;
  contacts: number; meetings: number };
export type PerfumeShowContactStatus = "attends" | "meeting_asked" | "meeting_booked" | "met";
export type PerfumeShowContact = { id: string; company_id: string; company: string; role: PerfumeContactRole | null; city: string | null; country: string | null;
  person_id: string | null; person: string | null; email: string | null; phone: string | null; status: PerfumeShowContactStatus; meeting_at: string | null;
  booth: string | null; note: string | null };
export const listPerfumeShows = () => apiRequest<{ shows: PerfumeShow[] }>("/api/v1/perfume/trade-shows");
export const savePerfumeShow = (s: Partial<PerfumeShow> & { name: string }) => apiRequest<{ id: string; created: boolean }>("/api/v1/perfume/trade-shows", { method: "POST", body: s });
export const importPerfumeShows = (shows: Array<Partial<PerfumeShow> & { name: string }>) =>
  apiRequest<{ shows: number; created: number; matched: number }>("/api/v1/perfume/trade-shows/import", { method: "POST", body: { shows } });
export const setPerfumeShowIGo = (id: string, i_go: boolean) => apiRequest<{ ok: true }>(`/api/v1/perfume/trade-shows/${id}/i-go`, { method: "POST", body: { i_go } });
export const listPerfumeShowContacts = (id: string) => apiRequest<{ contacts: PerfumeShowContact[] }>(`/api/v1/perfume/trade-shows/${id}/contacts`);
export const addPerfumeShowContact = (id: string, b: { company_id: string; person_id?: string | null; status?: PerfumeShowContactStatus; booth?: string | null; note?: string | null }) =>
  apiRequest<{ id: string }>(`/api/v1/perfume/trade-shows/${id}/contacts`, { method: "POST", body: b });
export const updatePerfumeShowContact = (id: string, b: { status?: PerfumeShowContactStatus; meeting_at?: string | null; booth?: string | null; note?: string | null; archived?: boolean }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/trade-show-contacts/${id}`, { method: "PATCH", body: b });

/* ------------------------------------------------------------------ campaigns + traders (design boards 4 and 3) */

export type PerfumeCampaignFilters = PerfumeContactPicks & { roles?: Array<PerfumeContactRole | "none">; q?: string };
export type PerfumeSegment = { id: string; name: string; filters: PerfumeCampaignFilters; created_at: string; updated_at: string };
export type PerfumeAudience = { companies: number; people: number; with_email: number; phone_only: number; opted_out: number; invalid: number;
  recipients: number; en: number; es: number; sample: Array<{ email: string; language: "en" | "es" }> };
export type PerfumeCampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "stopped" | "failed";
export type PerfumeCampaign = { id: string; name: string; segment_id: string | null; segment_name?: string | null; filters: PerfumeCampaignFilters;
  language: "auto" | "en" | "es"; subject_en: string | null; subject_es: string | null; body_en: string | null; body_es: string | null;
  attachment_names: string[]; per_hour: number; status: PerfumeCampaignStatus; scheduled_for: string | null; recipients: number; sent: number;
  skipped: number; failed: number; error: string | null; started_at: string | null; finished_at: string | null; created_at: string; updated_at: string; batches?: number };
export type PerfumeCampaignDetail = { campaign: PerfumeCampaign; attachments: Array<{ id: string; file_name: string; mime_type: string; bytes: number }>;
  batches: Array<{ id: string; language: "en" | "es"; seq: number; recipients: number; sent: number; skipped: number; failed: number; status: string; error: string | null }> };
export type PerfumeCampaignInput = { id?: string; name: string; segment_id?: string | null; filters: PerfumeCampaignFilters; language: "auto" | "en" | "es";
  subject_en?: string | null; subject_es?: string | null; body_en?: string | null; body_es?: string | null; per_hour: number };

export const listPerfumeSegments = () => apiRequest<{ segments: PerfumeSegment[] }>("/api/v1/perfume/segments");
export const savePerfumeSegment = (b: { id?: string; name: string; filters: PerfumeCampaignFilters }) =>
  apiRequest<{ id: string }>("/api/v1/perfume/segments", { method: "POST", body: b });
export const archivePerfumeSegment = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/segments/${encodeURIComponent(id)}/archive`, { method: "POST", body: {} });
export const getPerfumeAudience = (filters: PerfumeCampaignFilters, language: "auto" | "en" | "es") =>
  apiRequest<PerfumeAudience>("/api/v1/perfume/campaigns/audience", { method: "POST", body: { filters, language } });
export const listPerfumeCampaigns = () => apiRequest<{ campaigns: PerfumeCampaign[] }>("/api/v1/perfume/campaigns");
export const getPerfumeCampaign = (id: string) => apiRequest<PerfumeCampaignDetail>(`/api/v1/perfume/campaigns/${encodeURIComponent(id)}`);
export const savePerfumeCampaign = (b: PerfumeCampaignInput) => apiRequest<{ id: string }>("/api/v1/perfume/campaigns", { method: "POST", body: b });
export const addPerfumeCampaignAttachment = (id: string, a: { name: string; mime_type?: string; content_base64: string }) =>
  apiRequest<{ id: string; bytes: number }>(`/api/v1/perfume/campaigns/${encodeURIComponent(id)}/attachments`, { method: "POST", body: a });
export const removePerfumeCampaignAttachment = (id: string, attachmentId: string) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/campaigns/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}/remove`, { method: "POST", body: {} });
export const testPerfumeCampaign = (id: string, language: "en" | "es") =>
  apiRequest<{ batch_id: string; to: string }>(`/api/v1/perfume/campaigns/${encodeURIComponent(id)}/test`, { method: "POST", body: { language } });
export const sendPerfumeCampaign = (id: string, when?: string | null) =>
  apiRequest<{ status: "sending" | "scheduled"; recipients: number; scheduled_for?: string }>(`/api/v1/perfume/campaigns/${encodeURIComponent(id)}/send`, { method: "POST", body: { when: when ?? null } });
export const stopPerfumeCampaign = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/campaigns/${encodeURIComponent(id)}/stop`, { method: "POST", body: {} });

export type PerfumeTradeStage = "offer_received" | "buyers_matched" | "offer_sent" | "negotiating" | "closed" | "lost";
export type PerfumeTradeBuyer = { id: string; company_id: string; company: string; status: "matched" | "offered" | "negotiating" | "won" | "lost"; offer_cents: number | null; note: string | null };
export type PerfumeTrade = { id: string; item: string; brand: string | null; upc: string | null; from_company_id: string | null; from_company: string | null;
  buy_cents: number | null; sell_cents: number | null; qty: number | null; stage: PerfumeTradeStage; note: string | null; closed_on: string | null;
  created_at: string; updated_at: string; buyers: PerfumeTradeBuyer[] };
export type PerfumeTraders = {
  kpis: { both: number; both_with_email: number; sent_lists: number; exposed_lists: number; common_buyers: number; open_trades: number; closed_trades: number };
  trades: PerfumeTrade[];
  common_buyers: Array<{ id: string; name: string; role: PerfumeContactRole | null; city: string | null; country: string | null; lists: number; senders: string[] }>;
  exposed_lists: Array<{ sender: string; buyers: number; first_on: string | null; last_on: string | null }>;
  matrix_brands: string[];
  matrix: Array<{ vendor_id: string; vendor: string; brands: Record<string, number>; carried: number }>;
  brand_options: Array<{ brand: string; vendors: number }>;
};
export type PerfumeTradeInput = { id?: string; item: string; brand?: string | null; upc?: string | null; from_company_id?: string | null;
  buy_cents?: number | null; sell_cents?: number | null; qty?: number | null; stage: PerfumeTradeStage; note?: string | null };

export const getPerfumeTraders = (brands: string[]) =>
  apiRequest<PerfumeTraders>(`/api/v1/perfume/traders${brands.length ? `?${new URLSearchParams({ brands: brands.join("|") }).toString()}` : ""}`);
export const savePerfumeTrade = (b: PerfumeTradeInput) => apiRequest<{ id: string }>("/api/v1/perfume/trades", { method: "POST", body: b });
export const setPerfumeTradeStage = (id: string, stage: PerfumeTradeStage) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/trades/${encodeURIComponent(id)}/stage`, { method: "POST", body: { stage } });
export const archivePerfumeTrade = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/trades/${encodeURIComponent(id)}/archive`, { method: "POST", body: {} });
export const addPerfumeTradeBuyer = (id: string, b: { company_id: string; offer_cents?: number | null; note?: string | null }) =>
  apiRequest<{ id: string }>(`/api/v1/perfume/trades/${encodeURIComponent(id)}/buyers`, { method: "POST", body: b });
export const updatePerfumeTradeBuyer = (id: string, b: { status?: PerfumeTradeBuyer["status"]; offer_cents?: number | null; note?: string | null; archived?: boolean }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/trade-buyers/${encodeURIComponent(id)}`, { method: "PATCH", body: b });

/** My offer list as the Excel workbook the desk exports (all items I offer), for a campaign attachment. */
export async function fetchPerfumeOfferExcel(): Promise<{ name: string; mime: string; bytes: ArrayBuffer }> {
  const q = perfumeGridQuery({ view: "all", mine: "offer", offset: 0, limit: 1 });
  const res = await fetch(resolveApiUrl(`/api/v1/perfume/export.xlsx?${q.toString()}`), { credentials: "include" });
  if (!res.ok) throw new Error(`Offer list export failed (${res.status})`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "TIO-Perfumes-offer.xlsx";
  return { name, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: await res.arrayBuffer() };
}

/* ------------------------------------------------------------------ leads: catalogs + contacts Excel round trip (owner 2026-11-26 17:38 CT) */

export type PerfumeCatalogKind = "vendor_type" | "customer_type" | "category" | "industry" | "segment" | "source_kind" | "review_tag" | "product_type" | "gender" | "item_category" | "olfactory_family" | "origin_country" | "shipping_method";
export type PerfumeCatalogs = { kinds: Array<{ kind: PerfumeCatalogKind; label: string; used_by?: "items" | "contacts" | "families"; values: Array<{ id: string; value: string; sort: number; contacts: number }> }> };
export const listPerfumeCatalogs = () => apiRequest<PerfumeCatalogs>("/api/v1/perfume/catalogs");
export const addPerfumeCatalogValue = (b: { kind: PerfumeCatalogKind; value: string }) => apiRequest<{ id: string }>("/api/v1/perfume/catalogs", { method: "POST", body: b });
export const renamePerfumeCatalogValue = (id: string, value: string) =>
  apiRequest<{ moved: number }>(`/api/v1/perfume/catalogs/${encodeURIComponent(id)}/rename`, { method: "POST", body: { value } });
export const archivePerfumeCatalogValue = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/catalogs/${encodeURIComponent(id)}/archive`, { method: "POST", body: {} });

/** Every contact as the Excel file the owner filters and categorizes (one row per person), saved to the computer. */
export async function downloadPerfumeContactsExcel(): Promise<number> {
  const res = await fetch(resolveApiUrl("/api/v1/perfume/contacts/export.xlsx"), { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "TIO-Perfumes-Leads.xlsx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click();
  window.setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60_000);
  return Number(res.headers.get("X-Rows") ?? 0);
}

export type PerfumeUploadKind = "export" | "email" | "leaked" | "phone" | "research" | "removed" | "other";
export type PerfumeUploadSummary = {
  file_name: string;
  sheets: Array<{ name: string; kind: PerfumeUploadKind | "skipped"; header_row: number | null; rows: number; used: number; columns: string[] }>;
  existing: { rows: number; companies_changed: number; people_changed: number; remove_companies: number; remove_people: number; not_found: number; conflicts: number };
  changes: Array<{ company: string; person: string | null; field: string; from: string | null; to: string | null }>;
  changes_total: number;
  conflicts: Array<{ company: string; field: string; values: string[] }>;
  not_found: Array<{ sheet: string; row: number; id: string }>;
  removals: Array<{ scope: "company" | "person"; company: string; person: string | null }>;
  new: { records: number; would_match: number; would_insert: number; people: number; by_kind: Partial<Record<PerfumeUploadKind, number>>;
    by_category: Record<string, { records: number; match: number }>;
    samples: Array<{ name: string; kind: PerfumeUploadKind; category: string | null; email: string | null; phone: string | null; country: string | null; leaked_from: string | null; match: string | null }> };
  unknown: Partial<Record<PerfumeCatalogKind, string[]>>;
  removed_check?: { companies: number; people: number; list: Array<{ scope: "company" | "person"; company: string; person: string | null }> };
};
export type PerfumeUploadResult = { companies_changed: number; people_changed: number; companies_removed: number; people_removed: number; records: number; inserted: number;
  matched: number; people_inserted: number; origins: number; skipped: number; catalog_added: number; errors: string[] };
export type PerfumeUpload = { id: string; file_name: string; status: "previewed" | "applying" | "applied" | "failed" | "discarded"; summary: PerfumeUploadSummary;
  options: PerfumeApplyOptions | null; result: PerfumeUploadResult | null; error: string | null; created_at: string; applied_at: string | null };
export type PerfumeApplyOptions = { skip_categories: string[]; skip_kinds: PerfumeUploadKind[]; add_unknown: boolean; apply_removed_check?: boolean };
export type PerfumeUploadRow = { id: string; file_name: string; status: PerfumeUpload["status"]; created_at: string; applied_at: string | null; error: string | null;
  existing: PerfumeUploadSummary["existing"] | null; new: Pick<PerfumeUploadSummary["new"], "records" | "would_match" | "would_insert" | "people"> | null; result: PerfumeUploadResult | null };

export const uploadPerfumeContacts = (b: { file_name: string; sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }> }) =>
  apiRequest<{ id: string; summary: PerfumeUploadSummary }>("/api/v1/perfume/contacts/uploads", { method: "POST", body: b });
export const listPerfumeContactUploads = () => apiRequest<{ uploads: PerfumeUploadRow[] }>("/api/v1/perfume/contacts/uploads");
export const getPerfumeContactUpload = (id: string) => apiRequest<PerfumeUpload>(`/api/v1/perfume/contacts/uploads/${encodeURIComponent(id)}`);
export const applyPerfumeContactUpload = (id: string, b: PerfumeApplyOptions) =>
  apiRequest<{ status: "applying" }>(`/api/v1/perfume/contacts/uploads/${encodeURIComponent(id)}/apply`, { method: "POST", body: b });
export const discardPerfumeContactUpload = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/contacts/uploads/${encodeURIComponent(id)}/discard`, { method: "POST", body: {} });

/* ------------------------------------------------------------------ M20 document catalogs (LEAD ROUND L.32) */
/** The picks on a quote / sales order / PO: terms from the engine's terms list (due date = date + days), shipping method, sales-tax code. */
export type PerfumeDocPicks = { payment_terms_id?: string | null; terms_days?: number | null; shipping_method?: string | null; tax_code_id?: string | null; tax_code_name?: string | null };
export type PerfumeDocPickPatch = { payment_terms_id?: string | null; shipping_method?: string | null; tax_code_id?: string | null };
export type PerfumeDocCatalogs = { terms: Array<{ id: string; name: string; days: number }>; shipping_methods: string[];
  tax_codes: Array<{ id: string; code: string; name: string; rate_pct: number | null }>; payment_methods: Array<{ code: string; name: string }> };
export const getPerfumeDocCatalogs = () => apiRequest<PerfumeDocCatalogs>("/api/v1/perfume/doc-catalogs");
/* ------------------------------------------------------------------ Quotations (owner 2026-11-26 18:13 CT) */
export type PerfumeQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type PerfumeQuoteRow = { id: string; number: string; company_id: string | null; customer_name: string; customer_email: string | null;
  customer_phone: string | null; quote_date: string; valid_until: string | null; status: PerfumeQuoteStatus; currency: "USD" | "MXN";
  terms: string | null; notes: string | null; total_cents: string | number; cost_cents: string | number; costed_total_cents: string | number; lines: number; units: number;
  /** The sales order this quote became (one per quote). */
  order_id?: string | null; order_number?: string | null } & PerfumeDocPicks;
export type PerfumeQuoteLine = { id: string; line_no: number; item_id: string | null; description: string; upc: string | null; qty: number;
  unit_price_cents: number; cost_cents: number | null; cost_vendor_id: string | null; cost_vendor: string | null; item_name: string | null };
export type PerfumeQuoteEvent = { id: string; kind: string; detail: Record<string, unknown>; created_at: string; by_email: string | null };
export type PerfumeQuote = Omit<PerfumeQuoteRow, "lines"> & { lines: PerfumeQuoteLine[]; events: PerfumeQuoteEvent[] };
export type PerfumeQuoteItem = { id: string; display_name: string; upc: string | null; best: { cents: number; vendor_id: string; vendor: string } | null };
export const listPerfumeQuotes = () => apiRequest<{ quotes: PerfumeQuoteRow[] }>("/api/v1/perfume/quotes");
export const getPerfumeQuote = (id: string) => apiRequest<PerfumeQuote>(`/api/v1/perfume/quotes/${id}`);
export const createPerfumeQuote = (b: { company_id?: string | null; customer_name?: string | null; valid_until?: string | null; currency?: "USD" | "MXN" }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/quotes", { method: "POST", body: b });
export const updatePerfumeQuote = (id: string, b: Partial<Pick<PerfumeQuoteRow, "customer_name" | "customer_email" | "customer_phone" | "valid_until" | "currency" | "terms" | "notes" | "quote_date">> & PerfumeDocPickPatch) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/quotes/${id}`, { method: "PATCH", body: b });
export const setPerfumeQuoteStatus = (id: string, status: PerfumeQuoteStatus) => apiRequest<{ ok: true }>(`/api/v1/perfume/quotes/${id}/status`, { method: "POST", body: { status } });
export const archivePerfumeQuote = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/quotes/${id}/archive`, { method: "POST", body: {} });
export const copyPerfumeQuote = (id: string) => apiRequest<{ id: string; number: string }>(`/api/v1/perfume/quotes/${id}/copy`, { method: "POST", body: {} });
export const addPerfumeQuoteLine = (id: string, b: { item_id?: string | null; description?: string | null; qty: number; unit_price_cents?: number | null }) =>
  apiRequest<{ id: string; unit_price_cents: number }>(`/api/v1/perfume/quotes/${id}/lines`, { method: "POST", body: b });
export const updatePerfumeQuoteLine = (lineId: string, b: { qty?: number; unit_price_cents?: number; description?: string }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/quote-lines/${lineId}`, { method: "PATCH", body: b });
export const removePerfumeQuoteLine = (lineId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/quote-lines/${lineId}/archive`, { method: "POST", body: {} });
export const searchPerfumeQuoteItems = (q: string) => apiRequest<{ items: PerfumeQuoteItem[] }>(`/api/v1/perfume/quote-items?q=${encodeURIComponent(q)}`);
export const perfumeQuotesOfContact = (companyId: string) => apiRequest<{ quotes: PerfumeQuoteRow[] }>(`/api/v1/perfume/contacts/${companyId}/quotes`);
export const perfumeQuotesOfItem = (itemId: string) => apiRequest<{ quotes: PerfumeQuoteRow[] }>(`/api/v1/perfume/items/${itemId}/quotes`);
/** Downloads a file the server builds (quote Excel / PDF, the quotes list). */
export async function downloadPerfumeFile(path: string, fallbackName: string) {
  const res = await fetch(resolveApiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click();
  window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60_000);
}

/* ------------------------------------------------------------------ Sales orders (owner 2026-11-26 19:08 / 19:12 CT) */
export type PerfumeOrderStatus = "open" | "shipped" | "cancelled";
export type PerfumeOrderRow = { id: string; number: string; quote_id: string | null; quote_number: string | null; company_id: string | null; customer_name: string;
  customer_email: string | null; customer_phone: string | null; ship_to: string | null; order_date: string; ship_by: string | null; status: PerfumeOrderStatus;
  currency: "USD" | "MXN"; terms: string | null; notes: string | null; purchase_orders: number; location_code: string | null; total_cents: string | number; cost_cents: string | number;
  costed_total_cents: string | number; lines: number; units: number; units_shipped: number } & PerfumeDocPicks;
export type PerfumeOrderLine = { id: string; line_no: number; item_id: string | null; description: string; upc: string | null; qty: number; qty_shipped: number;
  unit_price_cents: number; cost_cents: number | null; cost_vendor_id: string | null; cost_vendor: string | null };
export type PerfumeOrder = Omit<PerfumeOrderRow, "lines"> & { lines: PerfumeOrderLine[]; events: PerfumeQuoteEvent[] };
export const listPerfumeOrders = () => apiRequest<{ orders: PerfumeOrderRow[] }>("/api/v1/perfume/orders");
export const getPerfumeOrder = (id: string) => apiRequest<PerfumeOrder>(`/api/v1/perfume/orders/${id}`);
export const createPerfumeOrder = (b: { company_id?: string | null; customer_name?: string | null; ship_by?: string | null; location_code?: string | null }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/orders", { method: "POST", body: b });
export const orderFromPerfumeQuote = (quoteId: string, b: { ship_by?: string | null } = {}) =>
  apiRequest<{ id: string; number: string; created: boolean }>(`/api/v1/perfume/quotes/${quoteId}/order`, { method: "POST", body: b });
export const updatePerfumeOrder = (id: string, b: Partial<Pick<PerfumeOrderRow, "customer_name" | "customer_email" | "customer_phone" | "ship_to" | "ship_by" | "currency" | "terms" | "notes" | "location_code">> & PerfumeDocPickPatch) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/orders/${id}`, { method: "PATCH", body: b });
export const setPerfumeOrderStatus = (id: string, status: "open" | "cancelled") => apiRequest<{ ok: true }>(`/api/v1/perfume/orders/${id}/status`, { method: "POST", body: { status } });
export const shipAllPerfumeOrder = (id: string, location_code?: string) => apiRequest<{ lines: number; cost_cents: number }>(`/api/v1/perfume/orders/${id}/ship-all`, { method: "POST", body: location_code ? { location_code } : {} });
export const archivePerfumeOrder = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/orders/${id}/archive`, { method: "POST", body: {} });
export const addPerfumeOrderLine = (id: string, b: { item_id?: string | null; description?: string | null; qty: number; unit_price_cents?: number; price_override_reason?: string }) =>
  apiRequest<{ id: string; unit_price_cents: number }>(`/api/v1/perfume/orders/${id}/lines`, { method: "POST", body: b });
export const updatePerfumeOrderLine = (lineId: string, b: { qty?: number; unit_price_cents?: number; qty_shipped?: number; price_override_reason?: string }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/order-lines/${lineId}`, { method: "PATCH", body: b });
export const removePerfumeOrderLine = (lineId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/order-lines/${lineId}/archive`, { method: "POST", body: {} });
export const perfumeOrdersOfContact = (companyId: string) => apiRequest<{ orders: PerfumeOrderRow[] }>(`/api/v1/perfume/contacts/${companyId}/orders`);
export const perfumeOrdersOfItem = (itemId: string) => apiRequest<{ orders: PerfumeOrderRow[] }>(`/api/v1/perfume/items/${itemId}/orders`);

/* ------------------------------------------------------------------ Purchase orders (owner 2026-11-26 19:12 CT) */
export type PerfumePoStatus = "open" | "received" | "cancelled";
export type PerfumePoRow = { id: string; number: string; vendor_id: string; vendor_name: string; vendor_contact: string | null; sales_order_id: string | null;
  sales_order_number: string | null; sales_order_customer: string | null; order_date: string; expected_by: string | null; status: PerfumePoStatus;
  currency: "USD" | "MXN"; terms: string | null; notes: string | null; location_code: string | null; total_cents: string | number; lines: number; units: number; units_received: number } & PerfumeDocPicks;
export type PerfumePoLine = { id: string; line_no: number; sales_order_line_id: string | null; item_id: string | null; price_list_row_id: string | null;
  vendor_sku: string | null; description: string; upc: string | null; qty: number; qty_received: number; unit_cost_cents: number };
export type PerfumePo = Omit<PerfumePoRow, "lines"> & { lines: PerfumePoLine[]; events: PerfumeQuoteEvent[]; approved_at?: string | null; approval_note?: string | null;
  approved_by_email?: string | null; approval_over_cents?: number | null; needs_approval?: boolean; awaiting_approval?: boolean };
export const listPerfumePurchaseOrders = () => apiRequest<{ purchase_orders: PerfumePoRow[] }>("/api/v1/perfume/purchase-orders");
export const getPerfumePurchaseOrder = (id: string) => apiRequest<PerfumePo>(`/api/v1/perfume/purchase-orders/${id}`);
export const createPerfumePurchaseOrder = (b: { vendor_id: string; expected_by?: string | null; location_code?: string | null }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/purchase-orders", { method: "POST", body: b });
export const purchaseFromPerfumeOrder = (orderId: string, b: { expected_by?: string | null } = {}) =>
  apiRequest<{ purchase_orders: Array<{ id: string; number: string; vendor_id: string; lines: number }>; skipped: Array<{ line_no: number; description: string; reason: string }> }>(
    `/api/v1/perfume/orders/${orderId}/purchase`, { method: "POST", body: b });
export const updatePerfumePurchaseOrder = (id: string, b: Partial<Pick<PerfumePoRow, "expected_by" | "currency" | "terms" | "notes" | "order_date" | "location_code">> & Omit<PerfumeDocPickPatch, "tax_code_id">) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/purchase-orders/${id}`, { method: "PATCH", body: b });
export const setPerfumePurchaseOrderStatus = (id: string, status: "open" | "cancelled") => apiRequest<{ ok: true }>(`/api/v1/perfume/purchase-orders/${id}/status`, { method: "POST", body: { status } });
export const receiveAllPerfumePurchaseOrder = (id: string, location_code?: string) => apiRequest<{ lines: number; units: number }>(`/api/v1/perfume/purchase-orders/${id}/receive-all`, { method: "POST", body: location_code ? { location_code } : {} });
export const archivePerfumePurchaseOrder = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/purchase-orders/${id}/archive`, { method: "POST", body: {} });
export const addPerfumePurchaseLine = (id: string, b: { item_id?: string | null; description?: string | null; qty: number; unit_cost_cents?: number }) =>
  apiRequest<{ id: string; unit_cost_cents: number }>(`/api/v1/perfume/purchase-orders/${id}/lines`, { method: "POST", body: b });
export const updatePerfumePurchaseLine = (lineId: string, b: { qty?: number; unit_cost_cents?: number; qty_received?: number }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/purchase-order-lines/${lineId}`, { method: "PATCH", body: b });
export const removePerfumePurchaseLine = (lineId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/purchase-order-lines/${lineId}/archive`, { method: "POST", body: {} });
export const perfumePurchaseOrdersOfOrder = (orderId: string) => apiRequest<{ purchase_orders: PerfumePoRow[] }>(`/api/v1/perfume/orders/${orderId}/purchase-orders`);

/* ------------------------------------------------------------------ Profiles (owner 2026-11-26 19:12 CT) */
export type PerfumeProfileCompany = { id: string; name: string; role: string | null; vendor_type: string | null; customer_type: string | null; phone: string | null;
  website: string | null; address: string | null; city: string | null; state: string | null; country: string | null; status: string; people: number; email: string | null };
export type PerfumeVendorProfile = {
  vendor: { id: string; name: string; short_name: string | null; kind: PerfumeVendorKind; roles: string[]; contact: string | null; company_id: string | null };
  company: PerfumeProfileCompany | null;
  /** Contacts companies whose name matches, while the supplier is not linked — never linked on its own. */
  suggestions?: PerfumeProfileCompany[];
  lists: Array<{ id: string; list_date: string; label: string | null; file_name: string; source_kind: string; rows_saved: number; is_current: boolean; voided_at: string | null; matched: number; waiting: number }>;
  items: number; waiting: number; codes: number; words: number; confirmed: number; purchase_orders: PerfumePoRow[]; po_total_cents: number; po_open: number;
};
/** CONTROL item fields (migration 202617100100, LEAD L.20). Prices in cents. */
export type PerfumeItemControl = { pos_code?: string | null; ticket_description?: string | null; sold_by?: "piece" | "pack"; units_per_pack?: number | null;
  preferred_vendor_id?: string | null; is_stock_item?: boolean; is_active?: boolean; special_price_cents?: number | null; min_price_cents?: number | null; price_locked?: boolean;
  /** Margin groups (migration 202617150100). */ is_exclusive?: boolean; is_new_launch?: boolean };
export type PerfumeItemVendorLine = { id: string; vendor_id: string; vendor: string; kind: PerfumeVendorKind; sku: string | null; upc: string | null; brand: string | null;
  description: string; size_text: string | null; price_cents: number | null; qty: number | null; match_method: string | null; list_date: string };
export type PerfumeItemProfile = {
  item: { id: string; internal_code: string | null; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; display_name: string;
    model?: string | null; product_type?: string | null; category?: string | null; description?: string | null; family_id?: string | null; family?: string | null;
  case_pack?: number | null; min_order_qty?: number | null; weight_g?: number | null; origin_country?: string | null; hs_code?: string | null;
  regular_item_id?: string | null; regular_name?: string | null; } & PerfumeItemControl & { preferred_vendor?: string | null };
  upcs: string[]; vendor_lines: PerfumeItemVendorLine[];
  remembered: Array<{ id: string; vendor: string; vendor_id: string; sku: string | null; text_key: string | null; method: string; confirmed_at: string | null }>;
  quotes: PerfumeQuoteRow[]; orders: PerfumeOrderRow[]; purchase_orders: PerfumePoRow[]; best_cost_cents: number | null;
};
export type PerfumeCompanyActivity = { company: PerfumeProfileCompany; quotes: PerfumeQuoteRow[]; orders: PerfumeOrderRow[]; vendors: Array<{ id: string; name: string; kind: string }>;
  purchase_orders: PerfumePoRow[]; quoted_cents: number; ordered_cents: number; bought_cents: number };
export const getPerfumeVendorProfile = (vendorId: string) => apiRequest<PerfumeVendorProfile>(`/api/v1/perfume/vendors/${vendorId}/profile`);
export const setPerfumeVendorCompany = (vendorId: string, companyId: string | null) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/vendors/${vendorId}/company`, { method: "PATCH", body: { company_id: companyId } });
/** One company record (owner 2026-11-27 17:25 CT): each supplier / competitor list → its company in Contacts. */
export type PerfumeLinkCandidate = { id: string; name: string; role: string | null; city: string | null; state: string | null; country: string | null; people: number; exact: boolean; by_email?: "email" | "domain" };
export type PerfumeLinkProposal = { vendor_id: string; vendor: string; short_name: string | null; kind: string; company_name: string;
  action: "link" | "choose" | "create"; company_id: string | null; candidates: PerfumeLinkCandidate[] };
export type PerfumeNameCheckRow = { vendor_id: string; vendor: string; company_id: string; company: string; proposed: string };
export const getPerfumeCompanyNameCheck = () => apiRequest<{ rows: PerfumeNameCheckRow[] }>("/api/v1/perfume/vendor-links/names");
export const renamePerfumeCompany = (companyId: string, name: string) =>
  apiRequest<{ changed: boolean; name: string }>(`/api/v1/perfume/companies/${companyId}/name`, { method: "PATCH", body: { name } });
/** Owner 2026-11-28 14:05 CT: the people of a company — add, change, remove (archive) from its profile. */
export type PerfumePersonInput = { name?: string | null; title?: string | null; email?: string | null; other_emails?: string[]; phones?: string[]; role?: PerfumeContactRole | null };
export const addPerfumePerson = (companyId: string, b: PerfumePersonInput) =>
  apiRequest<{ person: { id: string } }>(`/api/v1/perfume/companies/${encodeURIComponent(companyId)}/people`, { method: "POST", body: b });
export const updatePerfumePerson = (personId: string, b: PerfumePersonInput) =>
  apiRequest<{ person: { id: string }; changed: string[] }>(`/api/v1/perfume/people/${encodeURIComponent(personId)}`, { method: "PATCH", body: b });
export const removePerfumePerson = (personId: string, reason?: string) =>
  apiRequest<{ removed: boolean }>(`/api/v1/perfume/people/${encodeURIComponent(personId)}/remove`, { method: "POST", body: { reason } });
export const confirmPerfumeCompanyName = (companyId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/companies/${companyId}/name-ok`, { method: "POST", body: {} });
export const getPerfumeVendorLinkPreview = () => apiRequest<{ proposals: PerfumeLinkProposal[]; linked: number; unlinked: number }>("/api/v1/perfume/vendor-links/preview");
export const applyPerfumeVendorLinks = (decisions: Array<{ vendor_id: string; company_id?: string; create_name?: string }>) =>
  apiRequest<{ linked: number; created: number }>("/api/v1/perfume/vendor-links/apply", { method: "POST", body: { decisions } });
export const getPerfumeItemProfile = (itemId: string) => apiRequest<PerfumeItemProfile | { merged_into_id: string }>(`/api/v1/perfume/items/${itemId}/profile`);
/** Role (vendor / customer / both) + vendor / customer type on the one company record. */
export const setPerfumeCompanyRole = (companyId: string, b: { role?: "vendor" | "customer" | "both" | null; vendor_type?: string | null; customer_type?: string | null }) =>
  apiRequest<{ changed: boolean; role: string | null; vendor_type: string | null; customer_type: string | null }>(`/api/v1/perfume/companies/${companyId}/role`, { method: "PATCH", body: b });
/** M19: the company center — open A/R + A/P from the books' aging, every transaction (each opens its page), notes. */
export type PerfumeCenterTxn = { key: string; type: "Quote" | "Sales order" | "Invoice" | "Payment" | "Credit memo" | "Purchase order" | "Bill" | "Bill payment" | "Vendor credit";
  side: "customer" | "vendor"; id: string; number: string | null; date: string | null; due_date: string | null; status: string | null; amount_cents: number; open_cents: number | null;
  tab: string | null; path: string | null };
type PerfumeAging = { current: number; b1: number; b2: number; b3: number; total: number };
export type PerfumeCompanyCenter = { company: { id: string; name: string } & Record<string, unknown>; notes: string | null; customer_ids: string[]; vendor_ids: string[];
  open_ar_cents: number; open_ap_cents: number; ar_aging: PerfumeAging; ap_aging: PerfumeAging; quoted_cents: number; ordered_cents: number; bought_cents: number;
  transactions: PerfumeCenterTxn[]; operating_company_id: string };
export const getPerfumeCompanyCenter = (companyId: string) => apiRequest<PerfumeCompanyCenter>(`/api/v1/perfume/companies/${companyId}/center`);
export const savePerfumeCompanyNotes = (companyId: string, notes: string | null) =>
  apiRequest<{ updated: number }>(`/api/v1/perfume/companies/${companyId}/notes`, { method: "PUT", body: { notes } });
export const getPerfumeCompanyActivity = (companyId: string) => apiRequest<PerfumeCompanyActivity>(`/api/v1/perfume/contacts/${companyId}/activity`);
/* ------------------------------------------------------------------ lead history + reverse links (fully-wired items f + g, owner 2026-11-26 18:13 CT) */
export type PerfumeLeadEvent = { id: string; entity: string; entity_id: string; action: string; detail: Record<string, unknown>; upload_id: string | null; created_at: string; by_name: string | null };
export const perfumeContactHistory = (id: string) => apiRequest<{ events: PerfumeLeadEvent[] }>(`/api/v1/perfume/contacts/${encodeURIComponent(id)}/history`);
export const perfumeHistoryOf = (kind: "trades" | "campaigns" | "segments" | "catalogs", id: string) =>
  apiRequest<{ events: PerfumeLeadEvent[] }>(`/api/v1/perfume/${kind}/${encodeURIComponent(id)}/history`);
export type PerfumeContactTrade = { id: string; item: string; brand: string | null; stage: PerfumeTradeStage; buy_cents: number | null; sell_cents: number | null;
  qty: number | null; updated_at: string; side: "offered by them" | "offered to them"; buyer_status: string | null; offer_cents: number | null };
export const perfumeContactTrades = (id: string) => apiRequest<{ trades: PerfumeContactTrade[] }>(`/api/v1/perfume/contacts/${encodeURIComponent(id)}/trades`);

/* ------------------------------------------------------------------ Inventory (ScentsX stock ledger, owner 2026-11-26 20:21 CT) */
export type PerfumeSite = { code: string; name: string; kind: "warehouse" | "store" | "transit" | "consignment" | "quarantine" | null; own: boolean; active: boolean; address: string | null;
  sort_order: number; units: number; items: number; fifo_value_cents: string | number };
export type PerfumeStockRow = { item_id: string; display_name: string; internal_code: string | null; location_code: string; location_name: string; qty: number;
  avg_cost_cents: number; fifo_value_cents: number; oldest_lot: string | null; min_qty: number | null; max_qty: number | null };
export type PerfumeMove = { id: string; moved_at: string; kind: string; item_id: string; display_name: string; location_code: string; qty: number; unit_cost_cents: number;
  qty_after: number; avg_cost_after_cents: number; lot_id: string | null; lot_code: string | null; reason: string | null;
  purchase_order_id: string | null; po_number: string | null; sales_order_id: string | null; so_number: string | null; transfer_id: string | null; transfer_number: string | null;
  count_id: string | null; count_number: string | null; writeoff_id?: string | null; writeoff_number?: string | null; by_email: string | null };
export type PerfumeLot = { id: string; location_code: string; lot_code: string | null; source: string; received_on: string; qty_in: number; qty_left: number; unit_cost_cents: number;
  vendor: string | null; po_line_id: string | null; po_number: string | null; po_id: string | null };
export type PerfumeTransferRow = { id: string; number: string; from_code: string; to_code: string; status: "draft" | "shipped" | "received" | "cancelled"; notes: string | null;
  created_at: string; shipped_at: string | null; received_at: string | null; lines: number; units: number };
export type PerfumeTransfer = PerfumeTransferRow & { lines: Array<{ id: string; item_id: string; display_name: string; qty: number; on_hand_from: number }>;
  moves: Array<{ kind: string; location_code: string; qty: number; unit_cost_cents: number; moved_at: string; display_name: string }> };
export type PerfumeCountRow = { id: string; number: string; location_code: string; status: "draft" | "submitted" | "posted" | "cancelled"; diff_value_cents: number | null;
  created_at: string; submitted_at: string | null; approved_at: string | null; submitted_by_email: string | null; approved_by_email: string | null; lines: number };
export type PerfumeCountLine = { id: string; item_id: string; display_name: string; tio_code: string | null; brand: string; upc: string | null; bin: string | null;
  expected_qty: number; counted_qty: number | null; counted_at: string | null; counted_by_email: string | null; on_hand_now: number; unit_cost_cents: number; variance: number | null };
export type PerfumeCount = Omit<PerfumeCountRow, "lines"> & { lines: PerfumeCountLine[]; needs_second_person: boolean; notes: string | null;
  totals: { lines: number; counted: number; not_counted: number; gain_cents: number; loss_cents: number; net_cents: number };
  selection?: { category?: string | null; brand?: string | null; product_type?: string | null; family_id?: string | null; include_zero?: boolean; all_items?: boolean } };
export type PerfumeOpening = { lists: string[]; lines: number; units: number; value_cents: number; skipped_no_cost: number; skipped_unknown_site: number;
  by_site: Array<{ code: string; units: number; value: number; lines: number }>; already_applied: boolean };
const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(v === true ? "1" : String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};
export const listPerfumeSites = () => apiRequest<{ sites: PerfumeSite[] }>("/api/v1/perfume/inventory/sites");
export const updatePerfumeSite = (code: string, b: { name?: string; kind?: "warehouse" | "store" | "consignment" | "quarantine" | null; own?: boolean; active?: boolean; address?: string | null }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/inventory/sites/${encodeURIComponent(code)}`, { method: "PATCH", body: b });
export const listPerfumeStock = (f: { location?: string; q?: string; item_id?: string; low?: boolean } = {}) =>
  apiRequest<{ stock: PerfumeStockRow[] }>(`/api/v1/perfume/inventory/stock${qs(f)}`);
export const perfumeStockExportPath = (f: { location?: string; q?: string; low?: boolean } = {}) => `/api/v1/perfume/inventory/stock/export.xlsx${qs(f)}`;
export const setPerfumeReorder = (b: { item_id: string; location_code: string; min_qty: number | null; max_qty: number | null }) =>
  apiRequest<{ ok: true }>("/api/v1/perfume/inventory/reorder", { method: "PUT", body: b });
export const perfumeItemLots = (itemId: string) => apiRequest<{ lots: PerfumeLot[]; stock: PerfumeStockRow[] }>(`/api/v1/perfume/items/${itemId}/lots`);
export const listPerfumeMoves = (f: { item_id?: string; location?: string; kind?: string; purchase_order_id?: string; sales_order_id?: string; limit?: number } = {}) =>
  apiRequest<{ moves: PerfumeMove[] }>(`/api/v1/perfume/inventory/moves${qs(f)}`);
export const listPerfumeTransfers = () => apiRequest<{ transfers: PerfumeTransferRow[] }>("/api/v1/perfume/inventory/transfers");
export const getPerfumeTransfer = (id: string) => apiRequest<PerfumeTransfer>(`/api/v1/perfume/inventory/transfers/${id}`);
export const createPerfumeTransfer = (b: { from_code: string; to_code: string; notes?: string | null }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/inventory/transfers", { method: "POST", body: b });
export const addPerfumeTransferLine = (id: string, b: { item_id: string; qty: number }) => apiRequest<{ id: string }>(`/api/v1/perfume/inventory/transfers/${id}/lines`, { method: "POST", body: b });
export const removePerfumeTransferLine = (lineId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/inventory/transfer-lines/${lineId}/archive`, { method: "POST", body: {} });
export const perfumeTransferAction = (id: string, action: "ship" | "receive" | "cancel") => apiRequest<{ ok: true }>(`/api/v1/perfume/inventory/transfers/${id}/${action}`, { method: "POST", body: {} });
export const listPerfumeCounts = () => apiRequest<{ counts: PerfumeCountRow[] }>("/api/v1/perfume/inventory/counts");
export const getPerfumeCount = (id: string) => apiRequest<PerfumeCount>(`/api/v1/perfume/inventory/counts/${id}`);
export const createPerfumeCount = (b: { location_code: string; all_items?: boolean; notes?: string | null; category?: string | null; brand?: string | null;
  product_type?: string | null; family_id?: string | null; include_zero?: boolean }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/inventory/counts", { method: "POST", body: b });
export const setPerfumeCountLine = (id: string, b: { item_id: string; counted_qty: number }) => apiRequest<{ ok: true }>(`/api/v1/perfume/inventory/counts/${id}/lines`, { method: "PUT", body: b });
export const submitPerfumeCount = (id: string) => apiRequest<{ diff_value_cents: number; needs_second_person: boolean }>(`/api/v1/perfume/inventory/counts/${id}/submit`, { method: "POST", body: {} });
export const postPerfumeCount = (id: string) => apiRequest<{ lines_moved: number }>(`/api/v1/perfume/inventory/counts/${id}/post`, { method: "POST", body: {} });
export const cancelPerfumeCount = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/inventory/counts/${id}/cancel`, { method: "POST", body: {} });
export type PerfumeWriteoffReason = "damaged" | "expired" | "stolen" | "counterfeit" | "sample" | "other";
export type PerfumeWriteoffRow = { id: string; number: string; location_code: string; reason: PerfumeWriteoffReason; notes: string | null;
  status: "draft" | "submitted" | "posted" | "cancelled"; value_cents: number | null; created_at: string; submitted_at: string | null; approved_at: string | null;
  submitted_by_email: string | null; approved_by_email: string | null; lines: number; units: number };
export type PerfumeWriteoff = Omit<PerfumeWriteoffRow, "lines" | "units"> & { needs_second_person: boolean;
  lines: Array<{ id: string; item_id: string; display_name: string; qty: number; lot_id: string | null; lot_code: string | null; on_hand: number }>;
  moves: Array<{ id: string; item_id: string; qty: number; unit_cost_cents: number; lot_id: string | null; moved_at: string }> };
export const listPerfumeWriteoffs = () => apiRequest<{ writeoffs: PerfumeWriteoffRow[] }>("/api/v1/perfume/inventory/writeoffs");
export const getPerfumeWriteoff = (id: string) => apiRequest<PerfumeWriteoff>(`/api/v1/perfume/inventory/writeoffs/${id}`);
export const createPerfumeWriteoff = (b: { location_code: string; reason: PerfumeWriteoffReason; notes?: string | null }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/inventory/writeoffs", { method: "POST", body: b });
export const addPerfumeWriteoffLine = (id: string, b: { item_id: string; qty: number; lot_id?: string | null }) =>
  apiRequest<{ id: string }>(`/api/v1/perfume/inventory/writeoffs/${id}/lines`, { method: "POST", body: b });
export const removePerfumeWriteoffLine = (lineId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/inventory/writeoff-lines/${lineId}`, { method: "DELETE" });
export const perfumeWriteoffAction = (id: string, action: "submit" | "post" | "cancel") =>
  apiRequest<Record<string, unknown>>(`/api/v1/perfume/inventory/writeoffs/${id}/${action}`, { method: "POST", body: {} });
export type PerfumeValuationRow = { location_code: string; item_id: string; display_name: string; qty: number; fifo_cents: number; avg_cents: number };
export type PerfumeValuation = { as_of: string; rows: PerfumeValuationRow[]; sites: Array<{ location_code: string; units: number; fifo_cents: number; avg_cents: number }>;
  total_fifo_cents: number; total_avg_cents: number };
export const getPerfumeValuation = (asOf: string, location?: string) => apiRequest<PerfumeValuation>(`/api/v1/perfume/inventory/valuation${qs({ as_of: asOf, location })}`);
export const perfumeValuationExportPath = (asOf: string, location?: string) => `/api/v1/perfume/inventory/valuation/export.xlsx${qs({ as_of: asOf, location })}`;
export const getPerfumePoApproval = () => apiRequest<{ approval_over_cents: number | null }>("/api/v1/perfume/purchase-orders-approval");
export const setPerfumePoApproval = (cents: number | null) =>
  apiRequest<{ approval_over_cents: number | null }>("/api/v1/perfume/purchase-orders-approval", { method: "PUT", body: { approval_over_cents: cents } });
export const approvePerfumePurchaseOrder = (id: string, note?: string | null) =>
  apiRequest<{ approved: true; total_cents: number }>(`/api/v1/perfume/purchase-orders/${id}/approve`, { method: "POST", body: { note: note ?? null } });
export const getPerfumeOpening = () => apiRequest<PerfumeOpening>("/api/v1/perfume/inventory/opening");
export const applyPerfumeOpening = (onDate: string) =>
  apiRequest<{ lines: number; units: number; value_cents: number }>("/api/v1/perfume/inventory/opening", { method: "POST", body: { on_date: onDate, confirm: true } });

/* ------------------------------------------------------------------ Price levels + customer accounts (owner 2026-11-26 20:21 / 20:28 CT) */
export type PerfumePriceLevel = { id: string; name: string; channel: "retail" | "wholesale" | "distributor" | "export"; method: "markup" | "margin"; pct: number | null;
  cost_basis: "avg" | "best_vendor"; floor_pct: number | null; tester_pct: number; active: boolean; sort_order: number; fixed_prices: number; customers: number };
export type PerfumeLevelItem = { id: string; item_id: string; display_name: string; min_qty: number; price_cents: number };
export type PerfumeAccountType = "cash" | "prepaid" | "credit" | "export";
export type PerfumeCustomerAccount = { company_id: string; company_name: string; city: string | null; country: string | null; account_type: PerfumeAccountType;
  price_level_id: string | null; price_level: string | null; terms_days: number | null; credit_limit_cents: number | null; on_hold: boolean; hold_reason: string | null;
  approved_at: string | null; approved_by_email: string | null; review_on: string | null; tax_number: string | null; resale_certificate: boolean; notes: string | null;
  open_applications: number; open_orders_cents: number };
export type PerfumeCreditApplication = { id: string; company_id: string; company_name?: string; legal_name: string; tax_number?: string | null; requested_limit_cents: number;
  requested_terms_days: number; status: "submitted" | "approved" | "rejected" | "withdrawn"; approved_limit_cents: number | null; approved_terms_days: number | null;
  decision_note?: string | null; created_at: string; decided_at: string | null; decided_by_email: string | null };
export const listPerfumePriceLevels = () => apiRequest<{ levels: PerfumePriceLevel[]; costs?: { stock: number; my_avg_cost: number; inventory_file: number; vendor_lists: number; any_cost: number } }>("/api/v1/perfume/price-levels");
export const savePerfumePriceLevel = (id: string | null, b: Partial<Pick<PerfumePriceLevel, "name" | "channel" | "method" | "pct" | "cost_basis" | "floor_pct" | "tester_pct" | "active">>) =>
  id ? apiRequest<{ id: string }>(`/api/v1/perfume/price-levels/${id}`, { method: "PATCH", body: b }) : apiRequest<{ id: string }>("/api/v1/perfume/price-levels", { method: "POST", body: b });
export const listPerfumeLevelItems = (id: string) => apiRequest<{ items: PerfumeLevelItem[] }>(`/api/v1/perfume/price-levels/${id}/items`);
export const setPerfumeLevelItem = (id: string, b: { item_id: string; min_qty: number; price_cents: number | null }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/price-levels/${id}/items`, { method: "PUT", body: b });
export const listPerfumeCustomerAccounts = () => apiRequest<{ accounts: PerfumeCustomerAccount[] }>("/api/v1/perfume/customer-accounts");
export const getPerfumeCustomerAccount = (companyId: string) =>
  apiRequest<{ account: PerfumeCustomerAccount | null; applications: PerfumeCreditApplication[]; events: PerfumeQuoteEvent[] }>(`/api/v1/perfume/contacts/${companyId}/account`);
export const savePerfumeCustomerAccount = (companyId: string, b: { account_type?: "cash" | "prepaid" | "export"; price_level_id?: string | null; terms_days?: number | null;
  credit_limit_cents?: number | null; review_on?: string | null; tax_number?: string | null; resale_certificate?: boolean; notes?: string | null }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/contacts/${companyId}/account`, { method: "PUT", body: b });
export const setPerfumeCustomerHold = (companyId: string, hold: boolean, reason: string) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/contacts/${companyId}/account/hold`, { method: "POST", body: { hold, reason } });
export const listPerfumeCreditApplications = (status?: string) => apiRequest<{ applications: PerfumeCreditApplication[] }>(`/api/v1/perfume/credit-applications${status ? `?status=${status}` : ""}`);
export const submitPerfumeCreditApplication = (companyId: string, b: { legal_name: string; tax_number?: string | null; address?: string | null; owners?: string | null;
  trade_references?: string | null; bank_reference?: string | null; requested_limit_cents: number; requested_terms_days: number; resale_certificate?: boolean; personal_guarantee?: boolean }) =>
  apiRequest<{ id: string }>(`/api/v1/perfume/contacts/${companyId}/credit-applications`, { method: "POST", body: b });
export const decidePerfumeCreditApplication = (id: string, b: { decision: "approved"; limit_cents: number; terms_days: number; note?: string | null } | { decision: "rejected"; note: string } | { decision: "withdrawn"; note?: string | null }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/credit-applications/${id}/decide`, { method: "POST", body: b });

/* ------------------------------------------------------------------ Item file + linkage (owner 2026-11-26 22:51 CT) */
export type PerfumeItemFileRow = { id: string; display_name: string; brand: string; name: string; size_ml: number | null; conc: string | null; gender: string | null; flags: string[] | null;
  model: string | null; product_type: string | null; category: string | null; description: string | null; family_id?: string | null; family?: string | null;
  case_pack?: number | null; min_order_qty?: number | null; weight_g?: number | null; origin_country?: string | null; hs_code?: string | null;
  tio_code: string | null; upcs: string[]; hk_codes: string[]; lists_linked: number; best_cost_cents: number | null; my_avg_cost_cents: number | null; my_last_cost_cents: number | null }
  & PerfumeItemControl & { preferred_vendor?: string | null };
export type PerfumeItemFileHas = "tio" | "no_tio" | "hk" | "no_hk" | "upc" | "no_upc" | "mine" | "active" | "inactive";
export type PerfumeItemScope = "mine" | "vendors" | "all";
export type PerfumeItemFileList = { total: number; rows: PerfumeItemFileRow[]; counts: { items: number; with_tio: number; with_hk: number; with_upc: number; mine: number; vendors_only: number } };
export type PerfumeItemFile = PerfumeItemProfile & {
  hk_codes: Array<{ id: string; sku: string; list: string; method: string; confirmed_at: string | null }>;
  costs: { my_avg_cost_cents: number | null; my_last_cost_cents: number | null };
  events: Array<{ id: string; kind: string; detail: Record<string, unknown>; created_at: string; by_email: string | null }>;
};
export type PerfumeItemEdit = { brand?: string; name?: string; size_ml?: number | null; conc?: string; gender?: string; flags?: string[]; tio_code?: string | null;
  model?: string | null; product_type?: string | null; category?: string | null; description?: string | null; family_id?: string | null; regular_item_id?: string | null;
  case_pack?: number | null; min_order_qty?: number | null; weight_g?: number | null; origin_country?: string | null; hs_code?: string | null; } & PerfumeItemControl;
export type PerfumeItemBulk = { ids: string[]; set: Omit<PerfumeItemEdit, "name" | "tio_code" | "flags" | "regular_item_id" | "pos_code" | "ticket_description">; flags_add?: string[]; flags_remove?: string[] };
export type PerfumeItemCreate = { brand: string; name: string; size_ml?: number | null; conc?: string; gender?: string; flags?: string[]; model?: string | null;
  product_type?: string | null; category?: string | null; description?: string | null; tio_code?: string | null; hk_code?: string | null; upc?: string | null; family_id?: string | null;
  case_pack?: number | null; min_order_qty?: number | null; weight_g?: number | null; origin_country?: string | null; hs_code?: string | null; } & PerfumeItemControl;
export const createPerfumeItem = (b: PerfumeItemCreate) => apiRequest<{ id: string; display_name: string }>("/api/v1/perfume/item-file", { method: "POST", body: b });
export const getPerfumeItemOptions = () => apiRequest<{ brands: string[]; models: string[]; sizes: string[] }>("/api/v1/perfume/item-file-options");
export const bulkEditPerfumeItems = (b: PerfumeItemBulk) => apiRequest<{ updated: number }>("/api/v1/perfume/item-file-bulk", { method: "POST", body: b });
export type PerfumeLinkageLine = { line_id: string; vendor_id: string; vendor: string; kind: string; sku: string | null; upc: string | null; brand: string | null; description: string;
  size_text: string | null; price_cents: number | null; match_status: string; match_method: string | null; list_date: string; item_id: string | null; item: string | null; tio_code: string | null;
  found_by: "upc" | "code" | "item" | "words" };
export type PerfumeLinkage = { q: string; upc: string | null; items: Array<{ id: string; display_name: string; tio_code: string | null; upcs: string[] }>; lines: PerfumeLinkageLine[] };
/** Owner 17:28 CT: multi-select filters on the item file (comma lists; empty = all). */
export type PerfumeItemFilters = Partial<Record<"stock" | "brand" | "product_type" | "gender" | "category" | "conc" | "origin" | "scent" | "family", string[]>>;
const itemQs = (f: { q?: string; has?: PerfumeItemFileHas; scope?: PerfumeItemScope; limit?: number; offset?: number; filters?: PerfumeItemFilters }) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f.filters ?? {})) if (v && v.length) p.set(k, v.join(","));
  if (f.scope) p.set("scope", f.scope);
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.has) p.set("has", f.has);
  if (f.limit != null) p.set("limit", String(f.limit));
  if (f.offset != null) p.set("offset", String(f.offset));
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const listPerfumeItemFile = (f: { q?: string; has?: PerfumeItemFileHas; scope?: PerfumeItemScope; limit?: number; offset?: number; filters?: PerfumeItemFilters } = {}) => apiRequest<PerfumeItemFileList>(`/api/v1/perfume/item-file${itemQs(f)}`);
export const perfumeItemFileExportPath = (f: { q?: string; has?: PerfumeItemFileHas; scope?: PerfumeItemScope; filters?: PerfumeItemFilters } = {}) => `/api/v1/perfume/item-file/export.xlsx${itemQs(f)}`;
export const getPerfumeItemFile = (id: string) => apiRequest<PerfumeItemFile | { merged_into_id: string }>(`/api/v1/perfume/item-file/${id}`);
export const updatePerfumeItemFile = (id: string, b: PerfumeItemEdit) => apiRequest<{ ok: true }>(`/api/v1/perfume/item-file/${id}`, { method: "PATCH", body: b });
export const addPerfumeItemUpc = (id: string, upc: string) =>
  apiRequest<{ upc: string; moved_from: string | null; lines_relinked: number }>(`/api/v1/perfume/item-file/${id}/upcs`, { method: "POST", body: { upc } });
export const addPerfumeItemHkCode = (id: string, hk_code: string) =>
  apiRequest<{ hk_code: string; moved_from: string | null; lines_relinked: number }>(`/api/v1/perfume/item-file/${id}/hk-codes`, { method: "POST", body: { hk_code } });
export const getPerfumeFillCodes = () => apiRequest<{ codes_on_list: number; will_fill: number; sample: Array<{ code: string; item_id: string; display_name: string }> }>("/api/v1/perfume/item-file-fill-codes");
export const applyPerfumeFillCodes = () => apiRequest<{ filled: number; previewed: number }>("/api/v1/perfume/item-file-fill-codes", { method: "POST", body: { confirm: true } });
export const getPerfumeLinkage = (q: string) => apiRequest<PerfumeLinkage>(`/api/v1/perfume/linkage?q=${encodeURIComponent(q)}`);

/* ------------------------------------------------------------------ Stock linkage (owner 2026-11-27 06:19 CT) */
export type PerfumeStockCandidate = { mine_id: string; id: string; display_name: string; score: number; same_brand: boolean; exact: boolean; lists: number; best_cents: number | null;
  upcs: string[] | null; sample: string | null };
export type PerfumeStockLinkRow = { id: string; display_name: string; upcs: string[] | null; hk: string | null; my_desc: string | null; candidates: PerfumeStockCandidate[] };
export type PerfumeStockQueue = { total: number; mine: number; linked: number; rows: PerfumeStockLinkRow[] };
export type PerfumeStrictPair = { mine_id: string; mine: string; vend_id: string; vend: string };
export const getPerfumeStockLinkage = (f: { q?: string; perfumes_only?: boolean; limit?: number; offset?: number } = {}) => {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.perfumes_only === false) p.set("perfumes_only", "false");
  if (f.limit) p.set("limit", String(f.limit));
  if (f.offset) p.set("offset", String(f.offset));
  const qs = p.toString();
  return apiRequest<PerfumeStockQueue>(`/api/v1/perfume/stock-linkage${qs ? `?${qs}` : ""}`);
};
export const linkPerfumeStockItem = (from_item_id: string, to_item_id: string) =>
  apiRequest<{ lines: number; into: string }>("/api/v1/perfume/stock-linkage/link", { method: "POST", body: { from_item_id, to_item_id } });
export const getPerfumeStrictLinks = () => apiRequest<{ pairs: PerfumeStrictPair[] }>("/api/v1/perfume/stock-linkage/strict");
export const applyPerfumeStrictLinks = () => apiRequest<{ linked: number }>("/api/v1/perfume/stock-linkage/strict", { method: "POST", body: { confirm: true } });

/* ------------------------------------------------------------------ Send list (owner 2026-11-26 23:23 CT) */
export const PERFUME_SEND_COLUMNS = ["description", "brand", "category", "size", "conc", "upc", "tio_code", "hk_code", "qty", "my_price", "level_price"] as const;
export type PerfumeSendColumn = (typeof PERFUME_SEND_COLUMNS)[number];
export type PerfumeSendListInput = { columns: PerfumeSendColumn[]; level_id?: string | null; sites: string[]; in_stock_only: boolean; exclude_restricted: boolean;
  exclude_brands: string[]; categories: string[]; title?: string };
export type PerfumeSendRow = { item_id: string; description: string; brand: string; category: string; size: number | null; conc: string; upc: string; tio_code: string;
  hk_code: string; qty: number; my_price: number | null; level_price: number | null };
export type PerfumeSendPreview = { rows: PerfumeSendRow[]; total: number; level: string | null; our_items: number; brands: string[];
  left_out: { restricted: number; brand: number; no_stock: number; category: number } };
export const getPerfumeRestricted = () => apiRequest<{ brands: string[]; items: Array<{ id: string; display_name: string }> }>("/api/v1/perfume/send-list/restricted");
export const setPerfumeRestricted = (b: { brands: string[]; item_ids: string[] }) =>
  apiRequest<{ brands: string[]; items: Array<{ id: string; display_name: string }> }>("/api/v1/perfume/send-list/restricted", { method: "PUT", body: b });
export const previewPerfumeSendList = (b: PerfumeSendListInput) => apiRequest<PerfumeSendPreview>("/api/v1/perfume/send-list/preview", { method: "POST", body: b });
export const attachPerfumeSendList = (b: PerfumeSendListInput & { campaign_id: string }) =>
  apiRequest<{ attached: string; rows: number }>("/api/v1/perfume/send-list/attach", { method: "POST", body: b });
/** The Excel he sends (POST: the choices travel in the body). */
export async function downloadPerfumeSendList(b: PerfumeSendListInput) {
  const res = await fetch(resolveApiUrl("/api/v1/perfume/send-list/export.xlsx"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": generateIdempotencyKey() }, body: JSON.stringify(b) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "TIO price list.xlsx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click();
  window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60_000);
}

/* ------------------------------------------------------------------ item families + replenishment (owner 2026-11-27 08:10 CT) */

export type PerfumeFamilyRow = { id: string; name: string; brand: string | null; olfactory_family: string | null; gender: string | null; launch_year: number | null;
  items: number; on_hand: number; stock_value_cents: number };
export type PerfumeFamilyInput = { name: string; brand?: string | null; olfactory_family?: string | null; gender?: string | null; launch_year?: number | null; notes?: string | null };
export type PerfumeFamilyProfile = {
  family: PerfumeFamilyRow & { notes: string | null; created_at: string; archived_at: string | null };
  items: Array<{ id: string; display_name: string; tio_code: string | null; size_ml: number | null; conc: string | null; product_type: string | null; flags: string[] | null;
    on_hand: number; avg_cost_cents: number | null; upcs: string[] }>;
  events: Array<{ id: string; kind: string; detail: Record<string, unknown>; created_at: string; by_email: string | null }>;
};
export const listPerfumeFamilies = (q = "") => apiRequest<{ rows: PerfumeFamilyRow[] }>(`/api/v1/perfume/families?${new URLSearchParams(q ? { q } : {}).toString()}`);
export const getPerfumeFamily = (id: string) => apiRequest<PerfumeFamilyProfile>(`/api/v1/perfume/families/${encodeURIComponent(id)}`);
export const createPerfumeFamily = (b: PerfumeFamilyInput) => apiRequest<{ id: string }>("/api/v1/perfume/families", { method: "POST", body: b });
export const updatePerfumeFamily = (id: string, b: Partial<PerfumeFamilyInput>) => apiRequest<{ ok: true }>(`/api/v1/perfume/families/${encodeURIComponent(id)}`, { method: "PATCH", body: b });
export const archivePerfumeFamily = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/families/${encodeURIComponent(id)}/archive`, { method: "POST", body: {} });

export type PerfumeItemSite = { location_code: string; location_name: string; kind: string | null; on_hand: number; avg_cost_cents: number | null; min_qty: number | null;
  max_qty: number | null; bin: string | null; reorder_qty: number | null };
export const getPerfumeItemSites = (itemId: string) => apiRequest<PerfumeItemSite[]>(`/api/v1/perfume/inventory/item-sites/${encodeURIComponent(itemId)}`);
export const setPerfumeItemReorder = (b: { item_id: string; location_code: string; min_qty: number | null; max_qty: number | null; bin?: string | null; reorder_qty?: number | null }) =>
  apiRequest<{ ok: true }>("/api/v1/perfume/inventory/reorder", { method: "PUT", body: b });
export type PerfumeReorderRow = { item_id: string; display_name: string; tio_code: string | null; location_code: string; location_name: string; bin: string | null;
  on_hand: number; on_order: number; min_qty: number; max_qty: number | null; reorder_qty: number | null; to_buy: number; vendor_id: string | null; vendor: string | null;
  unit_cost_cents: number | null; line_cost_cents: number | null };
export const getPerfumeReorder = (location_code?: string) =>
  apiRequest<{ rows: PerfumeReorderRow[] }>(`/api/v1/perfume/inventory/reorder-report?${new URLSearchParams(location_code ? { location_code } : {}).toString()}`);
export const makePerfumeReorderPos = (b: { location_code: string; item_ids: string[]; expected_by?: string | null }) =>
  apiRequest<{ purchase_orders: Array<{ id: string; number: string; vendor_id: string; lines: number }>; skipped: Array<{ item_id: string; display_name: string; reason: string }> }>(
    "/api/v1/perfume/inventory/reorder-report/purchase-orders", { method: "POST", body: b });

/* ------------------------------------------------------------------ wholesale lists (owner 2026-11-27 08:10 CT) */
export type PerfumeWholesaleRow = { item_id: string; tio_code: string | null; display_name: string; brand: string; family: string | null; category: string | null;
  product_type: string | null; size_ml: number | null; conc: string | null; gender: string | null; upc: string | null; case_pack: number | null; min_order_qty: number | null;
  available: number; origin_country: string | null; hs_code: string | null; price_cents: number | null; case_price_cents: number | null; price_from: "fixed" | "rule" | "tester" | null; regular_item_id: string | null; regular_name: string | null;
  breaks: Array<{ min_qty: number; price_cents: number }>; price_set_on: string | null };
export type PerfumeWholesaleFilter = { level_id: string; q?: string; category?: string; family_id?: string; in_stock?: "1" };
const wholesaleQs = (f: PerfumeWholesaleFilter) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as Array<[string, string]>).toString();
export const getPerfumeWholesaleList = (f: PerfumeWholesaleFilter) =>
  apiRequest<{ level: { id: string; name: string; channel: string; active: boolean; tester_pct: number }; rows: PerfumeWholesaleRow[]; priced: number }>(`/api/v1/perfume/wholesale-list?${wholesaleQs(f)}`);
export const perfumeWholesaleExportPath = (f: PerfumeWholesaleFilter) => `/api/v1/perfume/wholesale-list.xlsx?${wholesaleQs(f)}`;

/* ------------------------------------------------------------------ Inquiry + reports (LEAD ROUND L.20 items 2–6, CONTROL parity) */
export type PerfumeReportFilter = { family_id?: string; family_from?: string; family_to?: string; code_from?: string; code_to?: string; q?: string; zero?: "Y" | "N"; active_only?: "Y" | "N" };
export const perfumeReportQs = (f: Record<string, string | undefined>) =>
  Object.entries(f).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
export type PerfumeItemInquiry = {
  item: { id: string; display_name: string; brand: string; name: string; size_ml: number | null; conc: string | null; gender: string | null; flags: string[] | null;
    product_type: string | null; category: string | null; tio_code: string | null; pos_code: string | null; ticket_description: string | null; sold_by: "piece" | "pack";
    units_per_pack: number | null; is_stock_item: boolean; is_active: boolean; price_locked: boolean; case_pack: number | null; family_id: string | null; family: string | null;
    preferred_vendor_id: string | null; preferred_vendor: string | null };
  codes: { tio_code: string | null; pos_code: string | null; upcs: string[]; hk_codes: string[] };
  prices: Array<{ level_id: string; level: string; price_cents: number | null; how: string | null }>;
  special_price_cents: number | null; min_price_cents: number | null; best_supplier_cents: number | null;
  avg_cost_cents: number | null; avg_cost_source: string | null; last_cost_cents: number | null; last_cost_source: string | null; last_receipt_at: string | null;
  on_hand: number; inventory_value_cents: number; stock: Array<{ location_code: string; site: string | null; qty: number; avg_cost_cents: number | null; value_cents: number }>;
};
export const getPerfumeItemInquiry = (id: string) => apiRequest<PerfumeItemInquiry | { merged_into_id: string }>(`/api/v1/perfume/reports/item-inquiry/${id}`);
export type PerfumeStatusRow = { id: string; tio_code: string | null; pos_code: string | null; display_name: string; family: string | null; on_hand: number; avg_cost_cents: number | null; value_cents: number };
export const getPerfumeInventoryStatus = (f: PerfumeReportFilter) =>
  apiRequest<{ rows: PerfumeStatusRow[]; total: { items: number; on_hand: number; value_cents: number }; truncated: boolean }>(`/api/v1/perfume/reports/inventory-status?${perfumeReportQs(f)}`);
export type PerfumePriceBookRow = { id: string; tio_code: string | null; pos_code: string | null; upc: string | null; display_name: string; family: string | null; size_ml: number | null;
  on_hand: number; price_cents: number | null; special_price_cents: number | null; min_price_cents: number | null };
export const getPerfumePriceBook = (f: PerfumeReportFilter & { level_id: string }) =>
  apiRequest<{ level: { id: string; name: string }; rows: PerfumePriceBookRow[]; total: { items: number; priced: number }; truncated: boolean }>(`/api/v1/perfume/reports/price-book?${perfumeReportQs(f)}`);
export type PerfumeFamilyReportRow = { family_id: string | null; family: string; brand: string | null; items: number; items_on_hand: number; on_hand: number; value_cents: number };
export const getPerfumeFamilyReport = (activeOnly: "Y" | "N") =>
  apiRequest<{ rows: PerfumeFamilyReportRow[]; total: { families: number; items: number; items_on_hand: number; on_hand: number; value_cents: number } }>(`/api/v1/perfume/reports/families?active_only=${activeOnly}`);

/** ROUND P1.31 L2: company names in proper format — preview (rule's result per company), Apply (renames + one history row each). */
export type PerfumeNameFix = { id: string; role: string | null; from: string; to: string; added_on: string | null };
export const getPerfumeNameFixes = () => apiRequest<{ count: number; fixes: PerfumeNameFix[] }>("/api/v1/perfume/contacts/name-format/preview");
export const applyPerfumeNameFixes = (ids: string[]) =>
  apiRequest<{ renamed: number; skipped: number }>("/api/v1/perfume/contacts/name-format/apply", { method: "POST", body: { ids } });
export type PerfumeVendorTierRow = { vendor_id: string; vendor: string; items_compared: number; index_pct: number | null; cheapest_pct: number | null; priciest_pct: number | null;
  tier: "Low" | "Medium" | "High" | "Too few items" };
export const getPerfumeVendorTiers = (q: { min_items?: number; low_below?: number; high_above?: number } = {}) =>
  apiRequest<{ rows: PerfumeVendorTierRow[]; total: { vendors: number; low: number; medium: number; high: number; too_few: number } }>(
    `/api/v1/perfume/reports/vendor-tiers?${perfumeReportQs(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v == null ? undefined : String(v)])))}`);

/** ROUND P1.31 L1: customers ranked A/B/C on purchases (old systems' history + ScentsX invoices), per currency. */
export type PerfumeRankRow = { key: string; company_id: string | null; customer: string; role: string | null; linked: boolean; sources: string[];
  lifetime_cents: number; last12_cents: number; invoices: number; months: number; first_period: string | null; last_period: string | null; tier: "A" | "B" | "C"; rank: number; share: number };
export const getPerfumeCustomerRanking = (currency: "USD" | "MXN") =>
  apiRequest<{ currency: string; total_cents: number; customers: number; tiers: { A: number; B: number; C: number }; linked: number; rows: PerfumeRankRow[] }>(
    `/api/v1/perfume/customers/ranking?currency=${currency}`);

/** ROUND L.31 M27 — vendor ranking: ScentsX bills per buying vendor (the books), POs ordered / received, ABC on billed. */
export type PerfumeVendorRankRow = { vendor_id: string; vendor: string; company_id: string | null; billed_cents: number; billed12_cents: number; bills: number;
  ordered_cents: number; received_cents: number; pos: number; last_po_date: string | null; last_bill_date: string | null; price_rows: number;
  tier: "A" | "B" | "C" | null; rank: number | null; share: number };
export const getPerfumeVendorRanking = () =>
  apiRequest<{ total_billed_cents: number; vendors: number; bought_from: number; tiers: { A: number; B: number; C: number }; ordered_cents: number; rows: PerfumeVendorRankRow[] }>(
    "/api/v1/perfume/vendors/ranking");

/** Owner 16:32 CT: one company, many contacts — duplicate companies (same match key) merged into one; the others kept as its locations. */
export type PerfumeDupMember = { id: string; name: string; role: string | null; city: string | null; state: string | null; people: number; docs: number; sx_link: boolean; account: boolean; created_at: string };
export type PerfumeDupGroup = { key: string; name: string; keep: PerfumeDupMember; merge: PerfumeDupMember[]; companies: number };
export const getPerfumeDuplicates = () => apiRequest<{ groups: number; extra: number; rows: PerfumeDupGroup[] }>("/api/v1/perfume/contacts/duplicates");
export const mergePerfumeDuplicates = (keys: string[]) =>
  apiRequest<{ groups: number; merged: number; kept: string[] }>("/api/v1/perfume/contacts/duplicates/merge", { method: "POST", body: { keys } });
export type PerfumeCompanyLocation = { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null; country: string | null; phone: string | null; merged_at: string | null };
export const getPerfumeCompanyLocations = (id: string) => apiRequest<{ locations: PerfumeCompanyLocation[] }>(`/api/v1/perfume/contacts/${encodeURIComponent(id)}/locations`);
/** ROUND P1.31 L1: the old systems' purchase history (no balances) → POST in chunks of up to 5,000 rows. */
export type PerfumeHistoryRow = { source: "usa_store" | "mexico_file"; customer_no: string; customer_name: string; period_kind: "month" | "year"; period_start: string;
  invoices: number | null; amount_cents: number; currency: "USD" | "MXN" };
export const importPerfumePurchaseHistory = (rows: PerfumeHistoryRow[]) =>
  apiRequest<{ rows: number; inserted: number; updated: number }>("/api/v1/perfume/customers/purchase-history/import", { method: "POST", body: { rows } });

/** Owner 17:17 CT: automatic duplicate detector — recommendations the owner confirms (merge) or dismisses (not a duplicate). */
export type PerfumeDupCard = { id: string; name: string; role: string | null; city: string | null; state: string | null; phone: string | null; domain: string | null;
  address: string | null; people: number; docs: number; created_at: string };
export type PerfumeDupRec = { id: string; reasons: string[]; score: number; first_seen_at: string; a: PerfumeDupCard; b: PerfumeDupCard; keep: "a" | "b" };
export const getPerfumeDupRecommendations = () => apiRequest<{ open: number; found: number | null; scanned: boolean; rows: PerfumeDupRec[] }>("/api/v1/perfume/contacts/duplicate-recommendations");
export const confirmPerfumeDuplicates = (ids: string[], keep: Record<string, "a" | "b">) =>
  apiRequest<{ merged: number }>("/api/v1/perfume/contacts/duplicate-recommendations/confirm", { method: "POST", body: { ids, keep } });
export const dismissPerfumeDuplicates = (ids: string[]) =>
  apiRequest<{ dismissed: number }>("/api/v1/perfume/contacts/duplicate-recommendations/dismiss", { method: "POST", body: { ids } });
/** Owner 17:25 CT: merge one duplicate company from its pop-up — the record picked stays, the others become its locations. */
export const mergeOnePerfumeDuplicate = (keep: string, ids: string[]) =>
  apiRequest<{ merged: number }>("/api/v1/perfume/contacts/duplicates/merge-one", { method: "POST", body: { keep, ids } });
/** Owner 17:35 CT: catalog cleanup — product types without genders, customer / vendor types without overlaps (preview → Apply). */
export type PerfumeCleanupRow = { key: string; kind: PerfumeCatalogKind; list: string; from: string; to: string; why: string; carriers: number; done: boolean; counted_on: string };
export const getPerfumeCatalogCleanup = () =>
  apiRequest<{ rows: PerfumeCleanupRow[]; adds: Array<{ kind: PerfumeCatalogKind; list: string; value: string; exists: boolean }> }>("/api/v1/perfume/catalogs/cleanup");
export const applyPerfumeCatalogCleanup = (keys: string[]) =>
  apiRequest<{ applied: number; moved: number }>("/api/v1/perfume/catalogs/cleanup/apply", { method: "POST", body: { keys } });
export type PerfumeItemFacet = { value: string; count: number; label?: string };
export type PerfumeItemFacets = Record<"brand" | "product_type" | "gender" | "category" | "conc" | "origin" | "scent" | "family", PerfumeItemFacet[]>
  & { stock: { in_stock: number; out_of_stock: number; never_purchased: number; below_min: number } };
export const getPerfumeItemFacets = () => apiRequest<PerfumeItemFacets>("/api/v1/perfume/item-file/facets");
/** Owner 16:57 CT: merge a duplicate catalog value into another of the same list. */
export const mergePerfumeCatalogValue = (id: string, intoId: string) =>
  apiRequest<{ moved: number; into: string }>(`/api/v1/perfume/catalogs/${encodeURIComponent(id)}/merge`, { method: "POST", body: { into_id: intoId } });
/** Owner 18:21 CT: Create vendor / Create customer — one company through the import engine (never a second record for one on file). */
export const createPerfumeCompany = (record: unknown) => apiRequest<{ id: string | null; existed: boolean }>("/api/v1/perfume/contacts/create", { method: "POST", body: record });
/** Owner 18:21 CT: the company profile's Edit pop-up — contact fields + Relationship / Industry / Review tags / Business type. */
export type PerfumeCompanyDetails = Partial<Record<"phone" | "website" | "domain" | "address" | "city" | "state" | "zip" | "country" | "notes" | "segment" | "main_category", string | null>>
  & { categories?: string[]; review_tags?: string[] };
export const updatePerfumeCompanyDetails = (id: string, b: PerfumeCompanyDetails) =>
  apiRequest<{ changed: number }>(`/api/v1/perfume/companies/${encodeURIComponent(id)}/details`, { method: "PATCH", body: b });
/** LEAD item 23: re-link the purchase history to companies (after customers are imported or merged). */
export const relinkPerfumePurchaseHistory = () =>
  apiRequest<{ followed_merge: number; linked: number; unlinked_customers: number }>("/api/v1/perfume/customers/purchase-history/relink", { method: "POST", body: {} });

/* M22: packing slip + invoice print / e-mail from the sales order. */
export type PerfumeOrderInvoice = { id: string; display_id: string | null; status: string; total_cents: string | null; issue_date: string };
export const getPerfumeOrderInvoices = (orderId: string) =>
  apiRequest<{ invoices: PerfumeOrderInvoice[]; operating_company_id: string | null }>(`/api/v1/perfume/orders/${orderId}/invoices`);
export const emailPerfumeOrderDocument = (orderId: string, b: { doc: "packing_slip" | "invoice"; invoice_id?: string; to: string; subject?: string; message?: string }) =>
  apiRequest<{ ok: true; batch_id: string; recipients: number; file: string }>(`/api/v1/perfume/orders/${orderId}/email-document`, { method: "POST", body: b });

/* Concentration check (owner 2026-11-27 20:59 CT): items with no concentration compared with every list. */
export type PerfumeConcRow = { id: string; display_name: string; product_type: string; size_ml: number | null; status: "proposed" | "conflict" | "none";
  proposed: string | null; concs: string | null; agree_n: number; items_n: number; lines_n: number; evidence: string[] };
export type PerfumeConcCheck = { total: number; counts: { proposed: number; conflict: number; none: number }; limit: number; offset: number; rows: PerfumeConcRow[] };
export const getPerfumeConcCheck = (f: { product_type?: string; status?: string; q?: string; limit?: number; offset?: number }) =>
  apiRequest<PerfumeConcCheck>(`/api/v1/perfume/item-file/conc-check?${Object.entries(f).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`);
