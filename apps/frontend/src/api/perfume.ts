import { apiRequest, resolveApiUrl } from "./client";

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
};
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
export type PerfumeFacetKey = "category" | "gender" | "brand" | "size" | "vendor";
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
/** Match my list ↔ competitor: my offer items with no competitor line linked, and the lines each most likely is. */
export type PerfumeLineCandidate = { row_id: string; vendor: string; description: string; price_cents: number; score: number; why: string; linked_to: string | null };
/** gender: the line being linked is Men (M) or Women (W) — the other gender's bottles are never returned. */
const genderParam = (g: string | null | undefined) => (g === "M" || g === "W" ? `&gender=${g}` : "");
export const searchPerfumeItems = (q: string, gender?: string | null) => apiRequest<{ items: PerfumeItemHit[] }>(`/api/v1/perfume/items/search?q=${encodeURIComponent(q)}${genderParam(gender)}`);
export type PerfumeLineHit = { row_id: string; description: string; vendor: string; price_cents: number | null; linked_to: string | null; gender?: string | null };
export const searchPerfumeLines = (q: string, gender?: string | null) => apiRequest<{ lines: PerfumeLineHit[] }>(`/api/v1/perfume/lines/search?q=${encodeURIComponent(q)}${genderParam(gender)}`);
export const setPerfumeInternalCode = (itemId: string, code: string | null) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/items/${itemId}/internal-code`, { method: "PUT", body: { internal_code: code } });

export function perfumeGridQuery(p: { view: PerfumeGridView; sort?: string; dir?: "asc" | "desc"; q?: string; offset?: number; limit?: number; category?: string[]; gender?: string[]; brand?: string[]; size?: string[]; vendor?: string[]; target_pct?: number | null; earn_pct?: number | null; mine?: "offer" | "inventory" | "need" | null; carried?: boolean; base?: "mine" | "theirs"; match?: "all" | "matched" | "unmatched"; comps?: string[] }) {
  const s = new URLSearchParams({ view: p.view, dir: p.dir ?? "asc", q: p.q ?? "", offset: String(p.offset ?? 0), limit: String(p.limit ?? 200) });
  if (p.sort) s.set("sort", p.sort);
  for (const k of ["category", "gender", "brand", "size", "vendor"] as const) if (p[k]?.length) s.set(k, p[k]!.join(","));
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
  needs_email: number; people: number; with_email: number; phone_only: number };
export type PerfumeContactRow = { id: string; name: string; domain: string | null; role: PerfumeContactRole | null; vendor_type: string | null;
  customer_type: string | null; main_category: string | null; categories: string[]; city: string | null; state: string | null; country: string | null;
  phone: string | null; website: string | null; maps_uri: string | null; google_rating: string | null; google_rating_count: number | null;
  status: string; source: string; first_contact_on: string | null; last_email_on: string | null; people: number; with_email: number; how_started: string | null };
export type PerfumeContactFacet = "country" | "state" | "city" | "category" | "source" | "how";
export type PerfumeContactList = { counts: PerfumeContactCounts; total: number; limit: number; offset: number; rows: PerfumeContactRow[];
  facets?: Record<PerfumeContactFacet, Array<{ value: string; count: number }>> };
/** Several values per filter box ("|"-separated on the wire — a city name can hold a comma). */
export type PerfumeContactPicks = Partial<Record<"countries" | "states" | "cities" | "categories" | "sources" | "hows", string[]>>;
export function listPerfumeContacts(q: { role?: PerfumeContactRole | "none" | "all"; q?: string; source?: string; limit?: number; offset?: number } & PerfumeContactPicks) {
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
