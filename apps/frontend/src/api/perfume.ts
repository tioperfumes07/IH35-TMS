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
export type PerfumeContactFacet = "country" | "state" | "city" | "category" | "source" | "how" | "region" | "ctype" | "vtype" | "segment" | "status" | "show" | "reach" | "kind";
export type PerfumeContactList = { counts: PerfumeContactCounts; total: number; limit: number; offset: number; rows: PerfumeContactRow[];
  facets?: Record<PerfumeContactFacet, Array<{ value: string; count: number }>> };
/** Several values per filter box ("|"-separated on the wire — a city name can hold a comma). */
export type PerfumeContactPicks = Partial<Record<"countries" | "states" | "cities" | "categories" | "sources" | "hows" | "regions" | "ctypes" | "vtypes" | "segments" | "statuses" | "shows" | "reach" | "kinds", string[]>>;
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

export type PerfumeCatalogKind = "vendor_type" | "customer_type" | "category" | "segment" | "source_kind" | "product_type" | "gender";
export type PerfumeCatalogs = { kinds: Array<{ kind: PerfumeCatalogKind; label: string; values: Array<{ id: string; value: string; sort: number; contacts: number }> }> };
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

/* ------------------------------------------------------------------ Quotations (owner 2026-11-26 18:13 CT) */
export type PerfumeQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type PerfumeQuoteRow = { id: string; number: string; company_id: string | null; customer_name: string; customer_email: string | null;
  customer_phone: string | null; quote_date: string; valid_until: string | null; status: PerfumeQuoteStatus; currency: "USD" | "MXN";
  terms: string | null; notes: string | null; total_cents: string | number; cost_cents: string | number; costed_total_cents: string | number; lines: number; units: number;
  /** The sales order this quote became (one per quote). */
  order_id?: string | null; order_number?: string | null };
export type PerfumeQuoteLine = { id: string; line_no: number; item_id: string | null; description: string; upc: string | null; qty: number;
  unit_price_cents: number; cost_cents: number | null; cost_vendor_id: string | null; cost_vendor: string | null; item_name: string | null };
export type PerfumeQuoteEvent = { id: string; kind: string; detail: Record<string, unknown>; created_at: string; by_email: string | null };
export type PerfumeQuote = Omit<PerfumeQuoteRow, "lines"> & { lines: PerfumeQuoteLine[]; events: PerfumeQuoteEvent[] };
export type PerfumeQuoteItem = { id: string; display_name: string; upc: string | null; best: { cents: number; vendor_id: string; vendor: string } | null };
export const listPerfumeQuotes = () => apiRequest<{ quotes: PerfumeQuoteRow[] }>("/api/v1/perfume/quotes");
export const getPerfumeQuote = (id: string) => apiRequest<PerfumeQuote>(`/api/v1/perfume/quotes/${id}`);
export const createPerfumeQuote = (b: { company_id?: string | null; customer_name?: string | null; valid_until?: string | null; currency?: "USD" | "MXN" }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/quotes", { method: "POST", body: b });
export const updatePerfumeQuote = (id: string, b: Partial<Pick<PerfumeQuoteRow, "customer_name" | "customer_email" | "customer_phone" | "valid_until" | "currency" | "terms" | "notes" | "quote_date">>) =>
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
  costed_total_cents: string | number; lines: number; units: number; units_shipped: number };
export type PerfumeOrderLine = { id: string; line_no: number; item_id: string | null; description: string; upc: string | null; qty: number; qty_shipped: number;
  unit_price_cents: number; cost_cents: number | null; cost_vendor_id: string | null; cost_vendor: string | null };
export type PerfumeOrder = Omit<PerfumeOrderRow, "lines"> & { lines: PerfumeOrderLine[]; events: PerfumeQuoteEvent[] };
export const listPerfumeOrders = () => apiRequest<{ orders: PerfumeOrderRow[] }>("/api/v1/perfume/orders");
export const getPerfumeOrder = (id: string) => apiRequest<PerfumeOrder>(`/api/v1/perfume/orders/${id}`);
export const createPerfumeOrder = (b: { company_id?: string | null; customer_name?: string | null; ship_by?: string | null; location_code?: string | null }) =>
  apiRequest<{ id: string; number: string }>("/api/v1/perfume/orders", { method: "POST", body: b });
export const orderFromPerfumeQuote = (quoteId: string, b: { ship_by?: string | null } = {}) =>
  apiRequest<{ id: string; number: string; created: boolean }>(`/api/v1/perfume/quotes/${quoteId}/order`, { method: "POST", body: b });
export const updatePerfumeOrder = (id: string, b: Partial<Pick<PerfumeOrderRow, "customer_name" | "customer_email" | "customer_phone" | "ship_to" | "ship_by" | "currency" | "terms" | "notes" | "location_code">>) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/orders/${id}`, { method: "PATCH", body: b });
export const setPerfumeOrderStatus = (id: string, status: "open" | "cancelled") => apiRequest<{ ok: true }>(`/api/v1/perfume/orders/${id}/status`, { method: "POST", body: { status } });
export const shipAllPerfumeOrder = (id: string, location_code?: string) => apiRequest<{ lines: number; cost_cents: number }>(`/api/v1/perfume/orders/${id}/ship-all`, { method: "POST", body: location_code ? { location_code } : {} });
export const archivePerfumeOrder = (id: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/orders/${id}/archive`, { method: "POST", body: {} });
export const addPerfumeOrderLine = (id: string, b: { item_id?: string | null; description?: string | null; qty: number; unit_price_cents?: number }) =>
  apiRequest<{ id: string; unit_price_cents: number }>(`/api/v1/perfume/orders/${id}/lines`, { method: "POST", body: b });
export const updatePerfumeOrderLine = (lineId: string, b: { qty?: number; unit_price_cents?: number; qty_shipped?: number }) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/order-lines/${lineId}`, { method: "PATCH", body: b });
export const removePerfumeOrderLine = (lineId: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/order-lines/${lineId}/archive`, { method: "POST", body: {} });
export const perfumeOrdersOfContact = (companyId: string) => apiRequest<{ orders: PerfumeOrderRow[] }>(`/api/v1/perfume/contacts/${companyId}/orders`);
export const perfumeOrdersOfItem = (itemId: string) => apiRequest<{ orders: PerfumeOrderRow[] }>(`/api/v1/perfume/items/${itemId}/orders`);

/* ------------------------------------------------------------------ Purchase orders (owner 2026-11-26 19:12 CT) */
export type PerfumePoStatus = "open" | "received" | "cancelled";
export type PerfumePoRow = { id: string; number: string; vendor_id: string; vendor_name: string; vendor_contact: string | null; sales_order_id: string | null;
  sales_order_number: string | null; sales_order_customer: string | null; order_date: string; expected_by: string | null; status: PerfumePoStatus;
  currency: "USD" | "MXN"; terms: string | null; notes: string | null; location_code: string | null; total_cents: string | number; lines: number; units: number; units_received: number };
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
export const updatePerfumePurchaseOrder = (id: string, b: Partial<Pick<PerfumePoRow, "expected_by" | "currency" | "terms" | "notes" | "order_date" | "location_code">>) =>
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
  lists: Array<{ id: string; list_date: string; label: string | null; file_name: string; source_kind: string; rows_saved: number; is_current: boolean; voided_at: string | null; matched: number; waiting: number }>;
  items: number; waiting: number; codes: number; words: number; confirmed: number; purchase_orders: PerfumePoRow[]; po_total_cents: number; po_open: number;
};
export type PerfumeItemVendorLine = { id: string; vendor_id: string; vendor: string; kind: PerfumeVendorKind; sku: string | null; upc: string | null; brand: string | null;
  description: string; size_text: string | null; price_cents: number | null; qty: number | null; match_method: string | null; list_date: string };
export type PerfumeItemProfile = {
  item: { id: string; internal_code: string | null; brand: string; name: string; size_ml: string | null; conc: string; gender: string; flags: string[]; display_name: string };
  upcs: string[]; vendor_lines: PerfumeItemVendorLine[];
  remembered: Array<{ id: string; vendor: string; vendor_id: string; sku: string | null; text_key: string | null; method: string; confirmed_at: string | null }>;
  quotes: PerfumeQuoteRow[]; orders: PerfumeOrderRow[]; purchase_orders: PerfumePoRow[]; best_cost_cents: number | null;
};
export type PerfumeCompanyActivity = { company: PerfumeProfileCompany; quotes: PerfumeQuoteRow[]; orders: PerfumeOrderRow[]; vendors: Array<{ id: string; name: string; kind: string }>;
  purchase_orders: PerfumePoRow[]; quoted_cents: number; ordered_cents: number; bought_cents: number };
export const getPerfumeVendorProfile = (vendorId: string) => apiRequest<PerfumeVendorProfile>(`/api/v1/perfume/vendors/${vendorId}/profile`);
export const setPerfumeVendorCompany = (vendorId: string, companyId: string | null) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/vendors/${vendorId}/company`, { method: "PATCH", body: { company_id: companyId } });
export const getPerfumeItemProfile = (itemId: string) => apiRequest<PerfumeItemProfile | { merged_into_id: string }>(`/api/v1/perfume/items/${itemId}/profile`);
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
export type PerfumeCount = Omit<PerfumeCountRow, "lines"> & { lines: Array<{ id: string; item_id: string; display_name: string; expected_qty: number; counted_qty: number;
  on_hand_now: number; unit_cost_cents: number }>; needs_second_person: boolean; notes: string | null };
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
export const createPerfumeCount = (b: { location_code: string; all_items?: boolean; notes?: string | null }) =>
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
  cost_basis: "avg" | "best_vendor"; floor_pct: number | null; active: boolean; sort_order: number; fixed_prices: number; customers: number };
export type PerfumeLevelItem = { id: string; item_id: string; display_name: string; min_qty: number; price_cents: number };
export type PerfumeAccountType = "cash" | "prepaid" | "credit" | "export";
export type PerfumeCustomerAccount = { company_id: string; company_name: string; city: string | null; country: string | null; account_type: PerfumeAccountType;
  price_level_id: string | null; price_level: string | null; terms_days: number | null; credit_limit_cents: number | null; on_hold: boolean; hold_reason: string | null;
  approved_at: string | null; approved_by_email: string | null; review_on: string | null; tax_number: string | null; resale_certificate: boolean; notes: string | null;
  open_applications: number; open_orders_cents: number };
export type PerfumeCreditApplication = { id: string; company_id: string; company_name?: string; legal_name: string; tax_number?: string | null; requested_limit_cents: number;
  requested_terms_days: number; status: "submitted" | "approved" | "rejected" | "withdrawn"; approved_limit_cents: number | null; approved_terms_days: number | null;
  decision_note?: string | null; created_at: string; decided_at: string | null; decided_by_email: string | null };
export const listPerfumePriceLevels = () => apiRequest<{ levels: PerfumePriceLevel[]; costs?: { stock: number; inventory_file: number; vendor_lists: number; any_cost: number } }>("/api/v1/perfume/price-levels");
export const savePerfumePriceLevel = (id: string | null, b: Partial<Pick<PerfumePriceLevel, "name" | "channel" | "method" | "pct" | "cost_basis" | "floor_pct" | "active">>) =>
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
