import { ApiError, apiRequest } from "./client";

function companyQuery(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function listHosViolations(
  companyId: string,
  filters: { driver_id?: string; from?: string; to?: string; source?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (filters.driver_id) qs.set("driver_id", filters.driver_id);
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

export function voidHosViolation(companyId: string, id: string) {
  return apiRequest<{ hos_violation: Record<string, unknown> }>(`/api/v1/safety/hos-violations/${id}/void?${companyQuery(companyId)}`, {
    method: "POST",
  });
}

export function listDotInspections(companyId: string) {
  return apiRequest<{ dot_inspections: Array<Record<string, unknown>> }>(`/api/v1/safety/dot-inspections?${companyQuery(companyId)}`);
}

export function createDotInspection(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dot-inspections?${companyQuery(companyId)}`, { method: "POST", body });
}

export async function uploadDotInspectionPdf(companyId: string, id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const url = `${base ? base.replace(/\/$/, "") : ""}/api/v1/safety/dot-inspections/${id}/upload-pdf?${companyQuery(companyId)}`;
  const response = await fetch(url, { method: "POST", credentials: "include", body: form });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as Record<string, unknown>;
}

export function voidDotInspection(companyId: string, id: string) {
  return apiRequest<{ dot_inspection: Record<string, unknown> }>(`/api/v1/safety/dot-inspections/${id}/void?${companyQuery(companyId)}`, {
    method: "POST",
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

export function listComplaints(companyId: string) {
  return apiRequest<{ complaints: Array<Record<string, unknown>> }>(`/api/v1/safety/complaints?${companyQuery(companyId)}`);
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

export function voidComplaintV64(companyId: string, id: string) {
  return apiRequest<{ complaint: Record<string, unknown> }>(`/api/v1/safety/complaints/${id}/void?${companyQuery(companyId)}`, { method: "POST" });
}

export function getIntegrityWoCostOutliers(companyId: string) {
  return apiRequest<{ outliers: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity/wo-cost-outliers?${companyQuery(companyId)}`);
}

export function getIntegrityFuelMpgAnomalies(companyId: string) {
  return apiRequest<{ anomalies: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity/fuel-mpg-anomalies?${companyQuery(companyId)}`);
}

export function getIntegrityDriverDwellOutliers(companyId: string) {
  return apiRequest<{ outliers: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity/driver-dwell-outliers?${companyQuery(companyId)}`);
}

export function getIntegrityHosPatternBreaks(companyId: string) {
  return apiRequest<{ pattern_breaks: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity/hos-pattern-breaks?${companyQuery(companyId)}`);
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
