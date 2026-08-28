import { apiRequest } from "./client";

/**
 * LEDGER-HEALTH — cross-integration reconciliation findings dashboard (READ-ONLY).
 * Mirrors qbo-recon.ts's client pattern; see apps/backend/src/system/ledger-health-reads.ts for the
 * self-close-only rationale. This client has no resolve/close/acknowledge call — GET only, by design.
 */

export type LedgerHealthFinding = {
  id: string;
  integration: string;
  finding_type: string;
  mirror_category: string;
  severity: string;
  status: string;
  drift_metric_abs: number | null;
  drift_metric_pct: number | null;
  resource_scope: unknown;
  local_value: unknown;
  remote_value: unknown;
  detected_at: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type LedgerHealthIntegrationSummary = {
  integration: string;
  open_count: number;
  critical_open_count: number;
  last_successful_tick_at: string | null;
  last_run_status: string | null;
};

export type LedgerHealthResponse = {
  operating_company_id: string;
  generated_at: string;
  findings: LedgerHealthFinding[];
  open_findings_count: number;
  critical_open_count: number;
  important_open_count: number;
  cleanup_open_count: number;
  by_integration: LedgerHealthIntegrationSummary[];
};

export async function getLedgerHealth(operatingCompanyId: string): Promise<LedgerHealthResponse> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<LedgerHealthResponse>(`/api/v1/system/ledger-health?${params.toString()}`);
}
