import { apiRequest } from "./client";

export type QboSyncHealthResponse = {
  status: "healthy" | "syncing" | "stale" | "error";
  last_successful_sync_at: string | null;
  pending_count: number;
  error_count: number;
};

export function getQboSyncHealth(operatingCompanyId: string) {
  return apiRequest<QboSyncHealthResponse>(
    `/api/v1/qbo/sync/health?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export type UnlinkedEntityRow = {
  entity_kind: "driver" | "unit" | "equipment";
  id: string;
  name: string;
  suggested_qbo_vendor_id: string | null;
  suggested_qbo_class_id: string | null;
  match_confidence: number;
};

export function getQboUnlinkedEntities(operatingCompanyId: string, type: "drivers" | "assets" | "both") {
  const qs = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    type,
  });
  return apiRequest<{ entities: UnlinkedEntityRow[] }>(`/api/v1/qbo/unlinked-entities?${qs.toString()}`);
}

export function postQboBulkLink(
  operatingCompanyId: string,
  body: {
    type: "drivers" | "assets" | "both";
    mappings: Array<{
      entity_kind: "driver" | "unit" | "equipment";
      entity_id: string;
      qbo_vendor_id?: string | null;
      qbo_class_id?: string | null;
    }>;
  }
) {
  return apiRequest<{ applied: number; failed: number; errors: Array<{ entity_id: string; message: string }> }>(
    "/api/v1/qbo/bulk-link",
    {
      method: "POST",
      body: { operating_company_id: operatingCompanyId, ...body },
    }
  );
}

/** Block V dashboard — qbo.sync_runs */
export type QboSyncRunStatus = "pending" | "running" | "success" | "failed" | "dead_letter" | "cancelled";

export type QboSyncRunRow = {
  id: string;
  started_at: string;
  completed_at?: string | null;
  kind: string;
  status: QboSyncRunStatus;
  retry_count: number;
  last_error?: string | null;
  duration_ms?: number | null;
  entity_kind?: string | null;
  entity_id?: string | null;
  payload?: unknown;
  error_stack?: string | null;
};

export type QboSyncAlertRecord = {
  id: string;
  severity: string;
  message?: string | null;
  created_at: string;
  resolved_at?: string | null;
  acknowledged_at?: string | null;
  error_payload?: unknown;
};

export type ListQboSyncRunsParams = {
  operating_company_id: string;
  status?: string;
  kind?: string;
  time_range?: "1h" | "24h" | "7d" | "30d";
  search?: string;
  limit?: number;
};

export async function listQboSyncRuns(params: ListQboSyncRunsParams) {
  const q = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.status) q.set("status", params.status);
  if (params.kind) q.set("kind", params.kind);
  if (params.time_range) q.set("time_range", params.time_range);
  if (params.search) q.set("search", params.search);
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiRequest<{ runs: QboSyncRunRow[] }>(`/api/v1/qbo/sync/runs?${q.toString()}`);
}

export async function listQboSyncAlerts(params: { operating_company_id: string; limit?: number; resolved?: boolean }) {
  const q = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.resolved === false) q.set("resolved", "false");
  return apiRequest<{ alerts: QboSyncAlertRecord[]; next_cursor: string | null }>(`/api/v1/qbo/sync/alerts?${q.toString()}`);
}

export async function retryQboSyncRun(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/qbo/sync/runs/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export async function dismissQboSyncRun(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/qbo/sync/runs/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export async function acknowledgeQboSyncAlert(id: string, operatingCompanyId: string, note?: string) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/qbo/sync/alerts/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, note },
  });
}
