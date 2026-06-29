// FIN-23 — QBO reconcile / modify-capture READ-ONLY client.
// All endpoints are GET; there is no resolve/apply call here by design.
import { apiRequest } from "./client";

export type QboSyncHealthRow = {
  entity: string;
  local_count: number | null;
  qbo_count: number | null;
  pending_count: number | null;
  drift: string | null;
};

export type QboConnectionSummary = {
  realm_id: string | null;
  authorized_at: string | null;
  last_used_at: string | null;
  last_refreshed_at: string | null;
  access_token_expires_at: string | null;
  revoked_at: string | null;
  connected: boolean;
};

export type QboReconcileOverview = {
  connection: QboConnectionSummary;
  health: QboSyncHealthRow[];
  last_polled_at: string | null;
  queue_depth: number;
  drift_count: number;
};

export type QboModifyCapture = {
  id: string;
  received_at: string;
  qbo_realm_id: string;
  qbo_event_type: string | null;
  qbo_entity_type: string | null;
  qbo_entity_id: string | null;
  qbo_last_updated_at: string | null;
  status: string;
  webhook_signature_valid: boolean;
  error_message: string | null;
  applied_to_tms_entity_table: string | null;
  applied_to_tms_entity_id: string | null;
  applied_at: string | null;
};

export type QboSyncConflict = {
  id: string;
  entity_type: string;
  entity_id: string;
  qbo_id: string | null;
  tms_snapshot: Record<string, unknown> | null;
  qbo_snapshot: Record<string, unknown> | null;
  conflict_fields: string[];
  severity: string;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
  resolution_notes: string | null;
};

export type QboReconAlert = {
  uuid: string;
  run_at: string;
  entity_type: string;
  local_count: number;
  qbo_count: number;
  delta_pct: string;
  severity: string;
  notified_at: string | null;
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function getQboReconcileOverview(operatingCompanyId: string): Promise<QboReconcileOverview> {
  return apiRequest<QboReconcileOverview>(
    `/api/v1/accounting/qbo-reconcile/overview${qs({ operating_company_id: operatingCompanyId })}`,
  );
}

export function getQboModifyCaptures(args: {
  operating_company_id: string;
  status?: string;
  entity_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: QboModifyCapture[]; total: number }> {
  return apiRequest(`/api/v1/accounting/qbo-reconcile/modify-captures${qs(args)}`);
}

export function getQboConflicts(args: {
  operating_company_id: string;
  open_only?: string;
  limit?: number;
  offset?: number;
  alert_limit?: number;
}): Promise<{ conflicts: QboSyncConflict[]; conflicts_total: number; alerts: QboReconAlert[] }> {
  return apiRequest(`/api/v1/accounting/qbo-reconcile/conflicts${qs(args)}`);
}
