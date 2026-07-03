import { apiRequest } from "./client";

export type ComplianceSeverity = "red" | "yellow" | "green";

export type ComplianceCredential = {
  credential_id: string;
  type: string;
  owner_type: string;
  owner_id: string;
  owner_name: string;
  label: string;
  expiration_date: string | null;
  days_until_expiration: number | null;
  severity: ComplianceSeverity;
  action_link: string;
};

export type ComplianceSummary = {
  red: number;
  yellow: number;
  green: number;
  total: number;
};

export function fetchComplianceDashboard(operatingCompanyId: string, filters?: { severity?: ComplianceSeverity }) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filters?.severity) params.set("severity", filters.severity);
  return apiRequest<{ credentials: ComplianceCredential[] }>(`/api/v1/compliance/dashboard?${params}`);
}

export function fetchComplianceSummary(operatingCompanyId: string) {
  return apiRequest<ComplianceSummary>(
    `/api/v1/compliance/dashboard/summary?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

// DOC-REQ-2c — per-entity "missing required documents" summary (drives the profile compliance chip).
export type MissingRequiredEnforcement = "warn" | "hard_block";

export type MissingRequiredItem = {
  code: string;
  label: string;
  enforcement: MissingRequiredEnforcement;
  authority: string | null;
  satisfied: boolean;
  needs_manual: boolean;
};

export type MissingRequiredSummary = {
  entity_kind: string;
  entity_id: string;
  required: MissingRequiredItem[];
  missing_count: number;
  worst_enforcement: "none" | "warn" | "hard_block";
};

export type MissingRequiredEntityKind = "driver" | "unit" | "customer" | "vendor";

export function fetchMissingRequired(
  operatingCompanyId: string,
  entityKind: MissingRequiredEntityKind,
  entityId: string
) {
  const params = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    entity_kind: entityKind,
    entity_id: entityId,
  });
  return apiRequest<MissingRequiredSummary>(`/api/v1/compliance/missing-required?${params}`);
}

export function fetchComplianceRules(operatingCompanyId: string) {
  return apiRequest<{ rules: Array<Record<string, unknown>> }>(
    `/api/v1/compliance/notification-rules?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function fetchComplianceLog(operatingCompanyId: string) {
  return apiRequest<{ entries: Array<Record<string, unknown>> }>(
    `/api/v1/compliance/notification-log?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createComplianceRule(payload: Record<string, unknown>) {
  return apiRequest<{ rule: Record<string, unknown> }>("/api/v1/compliance/notification-rules", {
    method: "POST",
    body: payload,
  });
}

export function archiveComplianceRule(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/compliance/notification-rules/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "DELETE" }
  );
}
