import { apiRequest } from "./client";

// Firewall: forecast client talks ONLY to /api/v1/forecast/* and (for picker reads)
// existing read-only lookup URLs. It imports no accounting/finance/reports module.
export const CASH_FORECAST_ENABLED_FLAG = "CASH_FORECAST_ENABLED";

export type ForecastRefKind = "account" | "unit" | "driver" | "truck" | "trailer";

export type ForecastEntry = {
  id: string;
  entry_date: string;
  direction: "income" | "expense";
  amount_cents: number;
  party_name: string | null;
  invoice_no: string | null;
  category: string | null;
  memo: string | null;
  ref_kind: ForecastRefKind | null;
  ref_label: string | null;
  ref_external_id: string | null;
};

export type ForecastEntryInput = {
  operating_company_id: string;
  entry_date: string;
  direction: "income" | "expense";
  amount_cents: number;
  party_name?: string | null;
  invoice_no?: string | null;
  category?: string | null;
  memo?: string | null;
  ref_kind?: ForecastRefKind | null;
  ref_label?: string | null;
  ref_external_id?: string | null;
};

export type ForecastOpeningBalance = {
  operating_company_id: string;
  amount_cents: number;
  as_of_date: string | null;
};

export function listForecastEntries(companyId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return apiRequest<{ entries: ForecastEntry[] }>(`/api/v1/forecast/cash-entries?${params.toString()}`);
}

export function createForecastEntry(payload: ForecastEntryInput) {
  return apiRequest<ForecastEntry>("/api/v1/forecast/cash-entries", { method: "POST", body: payload });
}

export function updateForecastEntry(id: string, payload: Partial<ForecastEntryInput> & { operating_company_id: string }) {
  return apiRequest<ForecastEntry>(`/api/v1/forecast/cash-entries/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
}

export function deleteForecastEntry(id: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/forecast/cash-entries/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(companyId)}`,
    { method: "DELETE" }
  );
}

export function getForecastOpeningBalance(companyId: string) {
  return apiRequest<ForecastOpeningBalance>(
    `/api/v1/forecast/opening-balance?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export function putForecastOpeningBalance(payload: { operating_company_id: string; amount_cents: number; as_of_date?: string | null }) {
  return apiRequest<ForecastOpeningBalance>("/api/v1/forecast/opening-balance", { method: "PUT", body: payload });
}
