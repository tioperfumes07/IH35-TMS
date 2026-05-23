import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getSafetyKpis(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dashboard/kpis?${q(companyId)}`);
}

export function getSafetyEvents(companyId: string) {
  return apiRequest<{
    events: Array<Record<string, unknown>>;
    counters: { active_count: number; resolved_count: number; total_count: number };
    filter: "active" | "resolved" | "all";
  }>(`/api/v1/safety/events?${q(companyId)}&filter=active`);
}

export function getSafetyEventsFiltered(companyId: string, filter: "active" | "resolved" | "all") {
  return apiRequest<{
    events: Array<Record<string, unknown>>;
    counters: { active_count: number; resolved_count: number; total_count: number };
    filter: "active" | "resolved" | "all";
  }>(`/api/v1/safety/events?${q(companyId)}&filter=${encodeURIComponent(filter)}`);
}

export function getUserPreferences() {
  return apiRequest<{ preferences: Record<string, unknown> }>("/api/v1/user/preferences");
}

export function patchUserPreferences(preferences: Record<string, unknown>) {
  return apiRequest<{ preferences: Record<string, unknown> }>("/api/v1/user/preferences", {
    method: "PATCH",
    body: { preferences },
  });
}

export function getSafetyAccidents(companyId: string) {
  return apiRequest<{ accidents: Array<Record<string, unknown>> }>(`/api/v1/safety/accidents?${q(companyId)}`);
}

export function getSafetyAccidentDetail(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}?${q(companyId)}`);
}

export function setSafetyAccidentStatus(id: string, companyId: string, status: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/status?${q(companyId)}`, {
    method: "PATCH",
    body: { status },
  });
}

export function spawnSafetyLiability(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/spawn-liability?${q(companyId)}`, {
    method: "POST",
  });
}

export function spawnSafetyWo(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/spawn-wo?${q(companyId)}`, {
    method: "POST",
  });
}

export function getTrainingCompletions(companyId: string) {
  return apiRequest<{ training_completions: Array<Record<string, unknown>> }>(
    `/api/v1/safety/training/completions?${q(companyId)}`
  );
}

export function getDrugAlcoholTests(companyId: string) {
  return apiRequest<{ tests: Array<Record<string, unknown>> }>(`/api/v1/safety/drug-alcohol/tests?${q(companyId)}`);
}

export function getLatestCsa(companyId: string) {
  return apiRequest<{ latest: Record<string, unknown> | null }>(`/api/v1/safety/csa/latest?${q(companyId)}`);
}

export function getSafetyFines(
  companyId: string,
  params: { status?: string; subject_type?: "driver" | "company"; subject_driver_id?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.status) qs.set("status", params.status);
  if (params.subject_type) qs.set("subject_type", params.subject_type);
  if (params.subject_driver_id) qs.set("subject_driver_id", params.subject_driver_id);
  return apiRequest<{ fines: Array<Record<string, unknown>> }>(`/api/v1/safety/fines?${qs.toString()}`);
}

export function createSafetyFine(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function convertFineToLiability(fineId: string, companyId: string) {
  return apiRequest<{ fine: Record<string, unknown>; liability?: Record<string, unknown> }>(
    `/api/v1/safety/fines/${fineId}/convert-to-liability?${q(companyId)}`,
    { method: "POST" }
  );
}

export function getCompanyViolations(companyId: string) {
  return apiRequest<{ company_violations: Array<Record<string, unknown>> }>(`/api/v1/safety/company-violations?${q(companyId)}`);
}

export function createCompanyViolation(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function updateCompanyViolation(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function completeCompanyViolationCorrectiveAction(id: string, companyId: string, body: Record<string, unknown> = {}) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}/complete-corrective-action?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function resolveCompanyViolation(
  id: string,
  companyId: string,
  body: {
    outcome: "warning" | "written_reprimand" | "monetary_fine" | "termination" | "dismissed";
    resolutionNotes: string;
    fineAmountCentsOverride?: number;
  }
) {
  return apiRequest<{
    violationUuid: string;
    autoCreatedInternalFineUuid: string | null;
    finalAmountCents: number | null;
  }>(`/api/v1/safety/company-violations/${id}/resolve?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function escalateCompanyViolation(id: string, companyId: string, reason: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}/escalate?${q(companyId)}`, {
    method: "POST",
    body: { reason },
  });
}

export function getDotInspections(companyId: string) {
  return apiRequest<{ inspections: Array<Record<string, unknown>> }>(`/api/v1/safety/dot-inspections?${q(companyId)}`);
}

export function createDotInspection(
  companyId: string,
  body: Record<string, unknown>
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dot-inspections?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function listDotInspectionEvents(companyId: string, followUpState = "open") {
  return apiRequest<{ events: Array<Record<string, unknown>> }>(
    `/api/v1/safety/dot-inspection-events?${q(companyId)}&follow_up_state=${encodeURIComponent(followUpState)}`
  );
}

export function followUpDotInspectionEvent(
  id: string,
  companyId: string,
  followUpState: "open" | "reviewed" | "citation" | "clean",
  note?: string
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dot-inspection-events/${id}/follow-up`, {
    method: "POST",
    body: {
      operating_company_id: companyId,
      follow_up_state: followUpState,
      note: note ?? null,
    },
  });
}

export function getInternalFines(companyId: string) {
  return apiRequest<{ fines: Array<Record<string, unknown>> }>(`/api/v1/safety/internal-fines?${q(companyId)}`);
}

export function createInternalFine(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/internal-fines?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getComplaints(companyId: string) {
  return apiRequest<{ complaints: Array<Record<string, unknown>> }>(`/api/v1/safety/complaints?${q(companyId)}`);
}

export function createComplaint(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/complaints?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getIntegrityAlerts(
  companyId: string,
  params: { alert_category?: string; severity?: string; resolution_status?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.alert_category) qs.set("alert_category", params.alert_category);
  if (params.severity) qs.set("severity", params.severity);
  if (params.resolution_status) qs.set("resolution_status", params.resolution_status);
  return apiRequest<{ integrity_alerts: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity-alerts?${qs.toString()}`);
}

export function acknowledgeIntegrityAlert(id: string, companyId: string, note: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/acknowledge?${q(companyId)}`, {
    method: "POST",
    body: { acknowledgment_note: note },
  });
}

export function resolveIntegrityAlert(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/resolve?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getSafetySettings(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/settings?${q(companyId)}`);
}

export function updateSafetySettings(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/settings?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export async function addAccidentPhoto(id: string, companyId: string, file: File) {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const url = `${base ? base.replace(/\/$/, "") : ""}/api/v1/safety/accidents/${id}/photos?${q(companyId)}`;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Upload failed");
  return payload;
}
