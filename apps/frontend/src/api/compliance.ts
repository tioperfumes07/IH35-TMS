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

export type ComplianceOwnerStatus = "expired" | "expiring_soon" | "compliant";

export type ComplianceOwnerRollup = {
  owner_id: string;
  owner_name: string;
  status: ComplianceOwnerStatus;
  credential_count: number;
  worst_days_until_expiration: number | null;
  action_link: string;
};

export type ComplianceDashboardResponse = {
  credentials: ComplianceCredential[];
  summary: ComplianceSummary;
  drivers: ComplianceOwnerRollup[];
  trucks: ComplianceOwnerRollup[];
};

export function fetchComplianceDashboard(operatingCompanyId: string, filters?: { severity?: ComplianceSeverity }) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filters?.severity) params.set("severity", filters.severity);
  return apiRequest<ComplianceDashboardResponse>(`/api/v1/compliance/dashboard?${params}`);
}

export function fetchComplianceSummary(operatingCompanyId: string) {
  return apiRequest<ComplianceSummary>(
    `/api/v1/compliance/dashboard/summary?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
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
    body: JSON.stringify(payload),
  });
}

export function archiveComplianceRule(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/compliance/notification-rules/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "DELETE" }
  );
}
