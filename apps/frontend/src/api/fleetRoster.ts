import { apiRequest } from "./client";

/** ROUND 313 E-17 fleet roster integrity. */
export type RosterFinding = {
  id: string;
  rule_code: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  evidence: Record<string, unknown>;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  unit_id: string | null;
  unit_number: string | null;
  samsara_vehicle_id: string | null;
  policy_id: string | null;
  policy_number: string | null;
  insurer_vendor_id: string | null;
  asset_id: string | null;
};
export type RosterIntegrityResponse = {
  rules: Record<string, { severity: string; label: string }>;
  last_run_at: string | null;
  findings: RosterFinding[];
};
const qs = (operatingCompanyId: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ operating_company_id: operatingCompanyId, ...extra }).toString();

export function getRosterIntegrity(operatingCompanyId: string, includeClosed = false) {
  return apiRequest<RosterIntegrityResponse>(`/api/v1/fleet/roster-integrity?${qs(operatingCompanyId, { include_closed: String(includeClosed) })}`);
}
export function runRosterIntegrity(operatingCompanyId: string) {
  return apiRequest<{ open: number; resolved: number }>(`/api/v1/fleet/roster-integrity/run?${qs(operatingCompanyId)}`, { method: "POST" });
}
export function voidRosterFinding(operatingCompanyId: string, id: string, reason: string) {
  return apiRequest<{ voided: string }>(`/api/v1/fleet/roster-integrity/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ operating_company_id: operatingCompanyId, reason }),
  });
}
