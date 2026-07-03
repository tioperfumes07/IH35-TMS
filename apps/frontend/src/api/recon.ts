import { apiRequest } from "./client";

// RECON-02 — read-only client for the RECON-01 reconciliation routes. The routes 404 when the recon module
// flag (TMS_QBO_RECON_ENABLED) is OFF; callers treat a 404 as "module not enabled" and show a hint.
export type ReconRun = {
  id: string;
  run_type: "am_bank_count" | "pm_categorization_diff" | "on_demand_bank_count" | "on_demand_categorization_diff";
  window_start: string | null;
  window_end: string | null;
  started_at: string | null;
  finished_at: string | null;
  preparer: string | null;
  reviewer: string | null;
  signed_off_at: string | null;
  totals: Record<string, unknown> | null;
  status: "running" | "complete" | "open" | "late";
};

export type ReconExceptionRow = {
  id: string;
  run_id: string;
  exception_class: string;
  source_ref: Record<string, unknown> | null;
  qbo_ref: Record<string, unknown> | null;
  field: string;
  tms_value: string | null;
  qbo_value: string | null;
  severity: "low" | "medium" | "high" | "elevated";
  status: "open" | "explained" | "resolved";
  resolved_by: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string | null;
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function fetchReconRuns(
  operatingCompanyId: string,
  filters?: { status?: string; limit?: number; offset?: number }
) {
  return apiRequest<{ runs: ReconRun[] }>(
    `/api/v1/accounting/recon/runs${qs({ operating_company_id: operatingCompanyId, ...filters })}`
  );
}

export function fetchReconExceptions(
  operatingCompanyId: string,
  filters?: { run_id?: string; status?: string; exception_class?: string; limit?: number; offset?: number }
) {
  return apiRequest<{ exceptions: ReconExceptionRow[] }>(
    `/api/v1/accounting/recon/exceptions${qs({ operating_company_id: operatingCompanyId, ...filters })}`
  );
}
