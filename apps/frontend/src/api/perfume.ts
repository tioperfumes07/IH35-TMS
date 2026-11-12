import { apiRequest, resolveApiUrl } from "./client";

/** PERFUME-DESK — owner-only TIO Perfumes price desk. Every amount is integer cents. */
export type PerfumeVendorKind = "buy" | "sell" | "both";
export type PerfumeVendor = {
  id: string;
  name: string;
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
};
export type PerfumeGridCol = { key: string; label: string; group: string; kind: "text" | "money" | "pct" | "int" };
export type PerfumeGridRow = Record<string, string | number | null>;
export type PerfumeGridView = "buy" | "sell" | "wholesale" | "all";
export type PerfumeGrid = {
  cols: PerfumeGridCol[];
  rows: PerfumeGridRow[];
  total: number;
  rules: PerfumeRules;
  vendors: PerfumeVendor[];
  measured_at: string;
};
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
  price_cents: number;
  match_status: "review" | "unmatched";
  suggestions: PerfumeSuggestion[];
};
export type PerfumeItemHit = { id: string; display_name: string; internal_code: string | null; upcs: string[] | null };

export const getPerfumeRules = () => apiRequest<PerfumeRules>("/api/v1/perfume/rules");
export const putPerfumeRules = (patch: Partial<PerfumeRules>) => apiRequest<PerfumeRules>("/api/v1/perfume/rules", { method: "PUT", body: patch });
export const listPerfumeVendors = () => apiRequest<{ vendors: PerfumeVendor[] }>("/api/v1/perfume/vendors");
export const savePerfumeVendor = (v: Partial<PerfumeVendor> & { name: string; earn_pct?: number | null }) =>
  apiRequest<PerfumeVendor>("/api/v1/perfume/vendors", { method: "POST", body: v });
export const listPerfumeLists = () => apiRequest<{ lists: PerfumeList[] }>("/api/v1/perfume/lists");
export const previewPerfumeImport = (b: PerfumeImportBody) => apiRequest<PerfumeImportCheck>("/api/v1/perfume/lists/preview", { method: "POST", body: b });
export const savePerfumeImport = (b: PerfumeImportBody) =>
  apiRequest<{ list_id: string; check: PerfumeImportCheck }>("/api/v1/perfume/lists", { method: "POST", body: b });
export const voidPerfumeList = (id: string, reason: string) => apiRequest<{ ok: true }>(`/api/v1/perfume/lists/${id}/void`, { method: "POST", body: { reason } });
export const getPerfumeReview = (offset = 0, limit = 100) =>
  apiRequest<{ rows: PerfumeReviewRow[]; total: number }>(`/api/v1/perfume/review?offset=${offset}&limit=${limit}`);
export const confirmPerfumeRow = (rowId: string, target: { item_id: string } | { create_new: true }) =>
  apiRequest<{ item_id: string; rows_linked: number }>(`/api/v1/perfume/rows/${rowId}/confirm`, { method: "POST", body: target });
export const searchPerfumeItems = (q: string) => apiRequest<{ items: PerfumeItemHit[] }>(`/api/v1/perfume/items/search?q=${encodeURIComponent(q)}`);
export const setPerfumeInternalCode = (itemId: string, code: string | null) =>
  apiRequest<{ ok: true }>(`/api/v1/perfume/items/${itemId}/internal-code`, { method: "PUT", body: { internal_code: code } });

export function perfumeGridQuery(p: { view: PerfumeGridView; sort?: string; dir?: "asc" | "desc"; q?: string; offset?: number; limit?: number }) {
  const s = new URLSearchParams({ view: p.view, dir: p.dir ?? "asc", q: p.q ?? "", offset: String(p.offset ?? 0), limit: String(p.limit ?? 200) });
  if (p.sort) s.set("sort", p.sort);
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
