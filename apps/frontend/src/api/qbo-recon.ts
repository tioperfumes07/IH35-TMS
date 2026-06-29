import { apiRequest } from "./client";

export type ReconBalance = {
  label: string;
  tms_cents: number;
  qbo_cents: number;
  in_sync: boolean;
  delta_cents: number;
};

export type ReconObject = {
  object: string;
  label: string;
  tms_count: number;
  qbo_mirror_count: number;
  qbo_remote_count: number | null;
  remote_collected_at: string | null;
  reference: "remote" | "mirror";
  count_in_sync: boolean;
  count_delta: number;
  balance: ReconBalance | null;
};

export type ReconFinding = {
  id: string;
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

export type ReconSyncState = {
  last_run_status: string | null;
  last_successful_tick_at: string | null;
  last_error_message: string | null;
  remote_counts_last_success_at: string | null;
  remote_counts_last_failure_at: string | null;
  remote_counts_consecutive_failures: number | null;
  remote_counts_available: boolean;
};

export type QboReconResponse = {
  operating_company_id: string;
  generated_at: string;
  objects: ReconObject[];
  findings: ReconFinding[];
  sync_state: ReconSyncState;
  open_findings_count: number;
};

export async function getQboReconciliation(operatingCompanyId: string): Promise<QboReconResponse> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<QboReconResponse>(`/api/v1/accounting/qbo-recon?${params.toString()}`);
}
