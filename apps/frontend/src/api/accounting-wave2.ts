import { apiRequest } from "./client";

const qco = (id: string) => `operating_company_id=${encodeURIComponent(id)}`;

export function listAccountingSyncConflicts(
  companyId: string,
  opts?: { status?: "unresolved" | "resolved"; severity?: "low" | "medium" | "high"; limit?: number; cursor?: number }
) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  if (opts?.status) q.set("status", opts.status);
  if (opts?.severity) q.set("severity", opts.severity);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.cursor != null) q.set("cursor", String(opts.cursor));
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/v1/accounting/sync-conflicts?${q}`);
}

export function getAccountingSyncConflict(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/accounting/sync-conflicts/${encodeURIComponent(id)}?${qco(companyId)}`);
}

export function resolveAccountingSyncConflict(
  id: string,
  body: { operating_company_id: string; resolution: "qbo_wins" | "tms_wins" | "manual_merge" | "dismissed"; notes?: string }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/accounting/sync-conflicts/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body,
  });
}

export function createAccountingPeriod(body: {
  operating_company_id: string;
  period_start: string;
  period_end: string;
  fiscal_year: number;
  period_label?: string;
}) {
  return apiRequest<{ id: string }>(`/api/v1/accounting/periods`, { method: "POST", body });
}

export function closeAccountingPeriod(periodId: string, body: { operating_company_id: string; closing_notes?: string }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/accounting/periods/${encodeURIComponent(periodId)}/close`, {
    method: "POST",
    body,
  });
}

export function reopenAccountingPeriod(periodId: string, body: { operating_company_id: string; reason: string }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/accounting/periods/${encodeURIComponent(periodId)}/reopen`, {
    method: "POST",
    body,
  });
}

export function getTrialBalanceReport(companyId: string, asOf?: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  if (asOf) q.set("as_of", asOf);
  return apiRequest<{ as_of: string | null; accounts: Array<Record<string, unknown>> }>(`/api/v1/accounting/reports/trial-balance?${q}`);
}

export function getSalesTaxSummary(companyId: string, start: string, end: string) {
  const q = new URLSearchParams({ operating_company_id: companyId, start, end });
  return apiRequest<{ summary: Record<string, unknown> | null }>(`/api/v1/accounting/sales-tax-summary?${q}`);
}

export function get1099Summary(companyId: string, year: number) {
  const q = new URLSearchParams({ operating_company_id: companyId, year: String(year) });
  return apiRequest<{ vendors: Array<Record<string, unknown>> }>(`/api/v1/accounting/1099-summary?${q}`);
}

export function post1099Correction(body: {
  operating_company_id: string;
  vendor_id: string;
  year: number;
  override_amount_cents: number;
  reason: string;
}) {
  return apiRequest<unknown>(`/api/v1/accounting/1099-corrections`, { method: "POST", body });
}

export function get1099FormPdf(vendorId: string, companyId: string, year: number) {
  const q = new URLSearchParams({ operating_company_id: companyId, year: String(year) });
  return apiRequest<Blob | string>(`/api/v1/accounting/1099-forms/${encodeURIComponent(vendorId)}?${q}`);
}
