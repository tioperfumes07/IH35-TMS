import { ApiError, apiRequest } from "./client";
import { resolveApiUrl } from "./client";

function companyQuery(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type IntegrityReportRow = Record<string, unknown> & {
  id?: string;
  driver_id?: string | null;
  unit_id?: string | null;
  vendor_id?: string | null;
  subject_driver_id?: string | null;
  subject_unit_id?: string | null;
  subject_vendor_id?: string | null;
  driver_name?: string | null;
  unit_number?: string | null;
  vendor_name?: string | null;
};

export function listHosViolations(
  companyId: string,
  filters: { driver_id?: string; load_id?: string; from?: string; to?: string; source?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (filters.driver_id) qs.set("driver_id", filters.driver_id);
  if (filters.load_id) qs.set("load_id", filters.load_id);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.source) qs.set("source", filters.source);
  return apiRequest<{ hos_violations: Array<Record<string, unknown>> }>(`/api/v1/safety/hos-violations?${qs.toString()}`);
}

export function createHosViolation(companyId: string, body: Record<string, unknown>) {
  return apiRequest<{ hos_violation: Record<string, unknown> }>(`/api/v1/safety/hos-violations?${companyQuery(companyId)}`, {
    method: "POST",
    body,
  });
}

export function voidHosViolation(companyId: string, id: string, reason: string) {
  return apiRequest<{ hos_violation: Record<string, unknown> }>(`/api/v1/safety/hos-violations/${id}/void?${companyQuery(companyId)}`, {
    method: "POST",
    body: { reason },
  });
}

export function listDotInspections(
  companyId: string,
  filters: { driver_id?: string; unit_id?: string; trailer_id?: string; limit?: number; offset?: number } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (filters.driver_id) qs.set("driver_id", filters.driver_id);
  if (filters.unit_id) qs.set("unit_id", filters.unit_id);
  if (filters.trailer_id) qs.set("trailer_id", filters.trailer_id);
  if (filters.limit != null) qs.set("limit", String(filters.limit));
  if (filters.offset != null) qs.set("offset", String(filters.offset));
  return apiRequest<{ dot_inspections: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/dot-inspections?${qs.toString()}`);
}

export function createDotInspection(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dot-inspections?${companyQuery(companyId)}`, { method: "POST", body });
}

export async function uploadDotInspectionPdf(companyId: string, id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const url = `/api/v1/safety/dot-inspections/${id}/upload-pdf?${companyQuery(companyId)}`;
  const response = await fetch(resolveApiUrl(url), { method: "POST", credentials: "include", body: form });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as Record<string, unknown>;
}

// SAF-F11: void_reason is REQUIRED by the backend (min 3 chars). It is no longer defaulted to a
// placeholder server-side, so the caller must capture a real reason from the operator.
export function voidDotInspection(companyId: string, id: string, voidReason: string) {
  return apiRequest<{ dot_inspection: Record<string, unknown> }>(`/api/v1/safety/dot-inspections/${id}/void?${companyQuery(companyId)}`, {
    method: "POST",
    body: { void_reason: voidReason },
  });
}

export function getCurrentCsaScore(companyId: string) {
  return apiRequest<{ current: Record<string, unknown> | null }>(`/api/v1/safety/csa-scores/current?${companyQuery(companyId)}`);
}

export function listCsaScores(companyId: string) {
  return apiRequest<{ csa_scores: Array<Record<string, unknown>> }>(`/api/v1/safety/csa-scores?${companyQuery(companyId)}`);
}

export function recomputeCsa(companyId: string) {
  return apiRequest<{ csa_score: Record<string, unknown> }>(`/api/v1/safety/csa-scores/compute?${companyQuery(companyId)}`, { method: "POST" });
}

export function pullCsaFromSafer(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/csa-scores/pull-from-safer?${companyQuery(companyId)}`, {
    method: "POST",
  });
}

export function listComplaints(
  companyId: string,
  params: { driver_id?: string; customer_id?: string; user_id?: string; limit?: number; offset?: number } = {}
) {
  const query = new URLSearchParams({ operating_company_id: companyId });
  if (params.driver_id) query.set("driver_id", params.driver_id);
  if (params.customer_id) query.set("customer_id", params.customer_id);
  if (params.user_id) query.set("user_id", params.user_id);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  return apiRequest<{ complaints: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/complaints?${query.toString()}`);
}

export function createComplaintV64(companyId: string, body: Record<string, unknown>) {
  return apiRequest<{ complaint: Record<string, unknown> }>(`/api/v1/safety/complaints?${companyQuery(companyId)}`, { method: "POST", body });
}

export function patchComplaintV64(companyId: string, id: string, body: Record<string, unknown>) {
  return apiRequest<{ complaint: Record<string, unknown> }>(`/api/v1/safety/complaints/${id}?${companyQuery(companyId)}`, {
    method: "PATCH",
    body,
  });
}

// SAF-F11: void_reason is REQUIRED by the backend (min 3 chars).
export function voidComplaintV64(companyId: string, id: string, voidReason: string) {
  return apiRequest<{ complaint: Record<string, unknown> }>(`/api/v1/safety/complaints/${id}/void?${companyQuery(companyId)}`, {
    method: "POST",
    body: { void_reason: voidReason },
  });
}

export function getIntegrityWoCostOutliers(companyId: string) {
  return apiRequest<{ outliers: IntegrityReportRow[] }>(`/api/v1/safety/integrity/wo-cost-outliers?${companyQuery(companyId)}`);
}

export function getIntegrityFuelMpgAnomalies(companyId: string) {
  return apiRequest<{ anomalies: IntegrityReportRow[] }>(`/api/v1/safety/integrity/fuel-mpg-anomalies?${companyQuery(companyId)}`);
}

export function getIntegrityDriverDwellOutliers(companyId: string) {
  return apiRequest<{ outliers: IntegrityReportRow[] }>(`/api/v1/safety/integrity/driver-dwell-outliers?${companyQuery(companyId)}`);
}

export function getIntegrityHosPatternBreaks(companyId: string) {
  return apiRequest<{ pattern_breaks: IntegrityReportRow[] }>(`/api/v1/safety/integrity/hos-pattern-breaks?${companyQuery(companyId)}`);
}

export function getIntegrityObservations(companyId: string) {
  return apiRequest<{ observations: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity/observations?${companyQuery(companyId)}`);
}

export function reviewIntegrityObservation(companyId: string, id: string) {
  return apiRequest<{ observation: Record<string, unknown> }>(
    `/api/v1/safety/integrity/observations/${id}/review?${companyQuery(companyId)}`,
    { method: "POST" }
  );
}
