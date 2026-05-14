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
