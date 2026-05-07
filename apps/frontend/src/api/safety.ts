import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getSafetyKpis(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dashboard/kpis?${q(companyId)}`);
}

export function getSafetyEvents(companyId: string) {
  return apiRequest<{ events: Array<Record<string, unknown>> }>(`/api/v1/safety/events?${q(companyId)}`);
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

export function spawnSafetyWo(
  id: string,
  companyId: string,
  payload?: { source_type?: "AC"; external_vendor_id?: string }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/spawn-wo?${q(companyId)}`, {
    method: "POST",
    body: payload,
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
  filters?: {
    status?: string;
    subject_type?: "driver" | "company";
    subject_driver_id?: string;
    issued_date_from?: string;
    issued_date_to?: string;
  }
) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (filters?.status) params.set("status", filters.status);
  if (filters?.subject_type) params.set("subject_type", filters.subject_type);
  if (filters?.subject_driver_id) params.set("subject_driver_id", filters.subject_driver_id);
  if (filters?.issued_date_from) params.set("issued_date_from", filters.issued_date_from);
  if (filters?.issued_date_to) params.set("issued_date_to", filters.issued_date_to);
  return apiRequest<{ fines: Array<Record<string, unknown>> }>(`/api/v1/safety/fines?${params.toString()}`);
}

export function createSafetyFine(
  companyId: string,
  payload: {
    subject_type: "driver" | "company";
    subject_driver_id?: string | null;
    issued_by_authority: string;
    jurisdiction?: string | null;
    violation_code?: string | null;
    violation_description: string;
    issued_date: string;
    amount_cents: number;
    related_load_id?: string | null;
    related_unit_id?: string | null;
    source_doc_id?: string | null;
    notes?: string | null;
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines?${q(companyId)}`, { method: "POST", body: payload });
}

export function updateSafetyFine(id: string, companyId: string, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines/${id}?${q(companyId)}`, { method: "PATCH", body: payload });
}

export function convertFineToLiability(id: string, companyId: string) {
  return apiRequest<{ fine: Record<string, unknown>; liability: Record<string, unknown>; message: string }>(
    `/api/v1/safety/fines/${id}/convert-to-liability?${q(companyId)}`,
    { method: "POST" }
  );
}

export function contestFine(id: string, companyId: string, notes?: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines/${id}/contest?${q(companyId)}`, {
    method: "POST",
    body: { notes },
  });
}

export function dismissFine(id: string, companyId: string, notes?: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines/${id}/dismiss?${q(companyId)}`, {
    method: "POST",
    body: { notes },
  });
}

export function reduceFine(id: string, companyId: string, amount_cents: number, reason: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines/${id}/reduce?${q(companyId)}`, {
    method: "POST",
    body: { amount_cents, reason },
  });
}

export function linkFinePayment(
  id: string,
  companyId: string,
  payload: { bank_transaction_id: string; paid_date: string; paid_amount_cents: number }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines/${id}/link-payment?${q(companyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function getCompanyViolations(companyId: string) {
  return apiRequest<{ company_violations: Array<Record<string, unknown>> }>(`/api/v1/safety/company-violations?${q(companyId)}`);
}

export function createCompanyViolation(companyId: string, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations?${q(companyId)}`, { method: "POST", body: payload });
}

export function updateCompanyViolation(id: string, companyId: string, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}?${q(companyId)}`, { method: "PATCH", body: payload });
}

export function completeCompanyViolationCorrectiveAction(id: string, companyId: string, payload?: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}/complete-corrective-action?${q(companyId)}`, {
    method: "POST",
    body: payload ?? {},
  });
}

export function escalateCompanyViolation(id: string, companyId: string, reason?: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}/escalate?${q(companyId)}`, {
    method: "POST",
    body: { reason },
  });
}

export function getIntegrityAlerts(companyId: string, filters?: Record<string, string>) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value) params.set(key, value);
  }
  return apiRequest<{ integrity_alerts: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity-alerts/list?${params.toString()}`);
}

export function acknowledgeIntegrityAlert(id: string, companyId: string, acknowledgment_note?: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/acknowledge?${q(companyId)}`, {
    method: "POST",
    body: { acknowledgment_note },
  });
}

export function resolveIntegrityAlert(
  id: string,
  companyId: string,
  payload: { resolution_status: "unresolved" | "investigating" | "false_positive" | "confirmed_action_taken" | "dismissed"; resolution_action?: string }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/resolve?${q(companyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function getSafetySettings(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/settings?${q(companyId)}`);
}

export function updateSafetySettings(companyId: string, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/settings?${q(companyId)}`, { method: "PATCH", body: payload });
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
