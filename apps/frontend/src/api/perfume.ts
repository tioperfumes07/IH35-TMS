import { apiRequest, resolveApiUrl } from "./client";

/** PERFUME-DESK — owner-only TIO Perfumes price desk. Every amount is integer cents. */
/** True only for the login listed in perfume.desk_users (other Owner-role users get false). */
export function getPerfumeAccess(): Promise<{ allowed: boolean }> {
  return apiRequest<{ allowed: boolean }>("/api/v1/perfume/access");
}
export type PerfumeVendorKind = "buy" | "sell" | "both" | "offer" | "inventory";
export type PerfumeVendor = {
  id: string;
  name: string;
  /** The owner's column-header abbreviation (PCA, MTZ, NAND, PPW …); the full name when empty. */
  short_name: string | null;
  kind: PerfumeVendorKind;
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
  round_step: "5" | "10" | "25" | "50" | "100" | "75";
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
};
export type PerfumeGridCol = { key: string; label: string; group: string; kind: "text" | "money" | "pct" | "int" };
export type PerfumeGridRow = Record<string, string | number | null>;
export type PerfumeGridView = "buy" | "trade" | "wholesale" | "comp" | "all";
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
  price: number | string;
  qty?: number | string | null;
  case_pack?: number | string | null;
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
  list_id: string;
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
export const voidPerfumeList = (id: string, reason: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/lists/${id}/void`, { method: "POST", body: { reason } });
export type PerfumeReviewFilter = { listIds?: string[]; q?: string; status?: "review" | "unmatched" | null };
export const getPerfumeReview = (offset = 0, limit = 100, f: PerfumeReviewFilter = {}) => {
  const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (f.listIds?.length) p.set("list_ids", f.listIds.join(","));
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.status) p.set("status", f.status);
  return apiRequest<{ rows: PerfumeReviewRow[]; total: number }>(`/api/v1/perfume/review?${p.toString()}`);
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
export const rematchPerfumeReview = () => apiRequest<Record<string, number>>("/api/v1/perfume/review/rematch", { method: "POST", body: {} });
export const bulkPerfumeReview = (b: PerfumeBulkAction) => apiRequest<PerfumeBulkResult>("/api/v1/perfume/rows/bulk", { method: "POST", body: b });
export const confirmPerfumeRow = (rowId: string, target: { item_id: string } | { create_new: true }) =>
  apiRequest<{ item_id: string; rows_linked: number }>(`/api/v1/perfume/rows/${rowId}/confirm`, { method: "POST", body: target });
export const searchPerfumeItems = (q: string) => apiRequest<{ items: PerfumeItemHit[] }>(`/api/v1/perfume/items/search?q=${encodeURIComponent(q)}`);
export const setPerfumeInternalCode = (itemId: string, code: string | null) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/items/${itemId}/internal-code`, { method: "PUT", body: { internal_code: code } });

export function perfumeGridQuery(p: { view: PerfumeGridView; sort?: string; dir?: "asc" | "desc"; q?: string; offset?: number; limit?: number; category?: string[]; gender?: string[]; brand?: string[]; size?: string[]; vendor?: string[]; target_pct?: number | null; earn_pct?: number | null; mine?: "offer" | "inventory" | "need" | null }) {
  const s = new URLSearchParams({ view: p.view, dir: p.dir ?? "asc", q: p.q ?? "", offset: String(p.offset ?? 0), limit: String(p.limit ?? 200) });
  if (p.sort) s.set("sort", p.sort);
  for (const k of ["category", "gender", "brand", "size", "vendor"] as const) if (p[k]?.length) s.set(k, p[k]!.join(","));
  if (p.target_pct != null) s.set("target_pct", String(p.target_pct));
  if (p.earn_pct != null) s.set("earn_pct", String(p.earn_pct));
  if (p.mine) s.set("mine", p.mine);
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
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
