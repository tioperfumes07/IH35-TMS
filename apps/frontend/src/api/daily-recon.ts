import { apiRequest } from "./client";

export type DailyReconMatchStatus =
  | "matched"
  | "missing_in_qbo"
  | "amount_mismatch"
  | "missing_in_tms";

export type DailyReconRow = {
  date: string;
  entity_type: string;
  entity_id: string;
  tms_je_id: string | null;
  tms_amount_cents: number | null;
  tms_memo: string | null;
  tms_status: string | null;
  qbo_id: string | null;
  qbo_sync_status: string | null;
  qbo_amount_cents: number | null;
  qbo_error: string | null;
  match_status: DailyReconMatchStatus;
  tms_detail_path: string | null;
};

export type DailyReconDay = {
  date: string;
  all_reconciled: boolean;
  rows: DailyReconRow[];
};

export type DailyReconResponse = {
  gl_posting_active: boolean;
  from_date: string;
  to_date: string;
  total: number;
  days: DailyReconDay[];
};

export type DailyReconFilters = {
  operating_company_id: string;
  from_date?: string;
  to_date?: string;
  entity_type?: string;
  match_status?: DailyReconMatchStatus | "all";
  limit?: number;
  offset?: number;
};

export function fetchDailyRecon(filters: DailyReconFilters): Promise<DailyReconResponse> {
  const params = new URLSearchParams();
  params.set("operating_company_id", filters.operating_company_id);
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  if (filters.entity_type) params.set("entity_type", filters.entity_type);
  if (filters.match_status) params.set("match_status", filters.match_status);
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));
  return apiRequest<DailyReconResponse>(`/api/v1/accounting/daily-recon?${params.toString()}`);
}
