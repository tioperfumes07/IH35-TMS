import { apiRequest } from "./client";

export const BULK_UPDATE_MAX_IDS = 200;

export type BulkUpdateFailure = {
  id: string;
  code: string;
  message: string;
};

export type BulkUpdateResponse = {
  requested: number;
  succeeded: string[];
  failed: BulkUpdateFailure[];
  audit_log_ids: string[];
  bulk_call_id: string;
};

export type BulkUpdateRequest<TPayload = Record<string, unknown>> = {
  domain: string;
  resource: string;
  ids: string[];
  action: string;
  payload?: TPayload;
  reason?: string;
  operatingCompanyId?: string;
};

export class BulkUpdateCapError extends Error {
  cap: number;
  attempted: number;

  constructor(cap: number, attempted: number) {
    super(`Bulk updates are limited to ${cap} items at a time. You selected ${attempted}.`);
    this.name = "BulkUpdateCapError";
    this.cap = cap;
    this.attempted = attempted;
  }
}

function normalizeResponse(raw: Record<string, unknown>): BulkUpdateResponse {
  const succeededRaw = raw.succeeded;
  const failedRaw = raw.failed;
  return {
    requested: Number(raw.requested ?? 0),
    succeeded: Array.isArray(succeededRaw)
      ? succeededRaw.map(String)
      : Array.isArray(raw.affected_ids)
        ? (raw.affected_ids as string[])
        : [],
    failed: Array.isArray(failedRaw)
      ? failedRaw.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            code: String(row.code ?? "E_UNKNOWN"),
            message: String(row.message ?? "Update failed"),
          };
        })
      : [],
    audit_log_ids: Array.isArray(raw.audit_log_ids) ? (raw.audit_log_ids as string[]) : [],
    bulk_call_id: String(raw.bulk_call_id ?? raw.bulkCallId ?? ""),
  };
}

export async function bulkUpdate<TPayload = Record<string, unknown>>(
  request: BulkUpdateRequest<TPayload>,
  options: { cap?: number; operatingCompanyId?: string } = {}
): Promise<BulkUpdateResponse> {
  const cap = options.cap ?? BULK_UPDATE_MAX_IDS;
  const { domain, resource, ids, action, payload, reason } = request;
  const operatingCompanyId = request.operatingCompanyId ?? options.operatingCompanyId;

  if (ids.length === 0) {
    throw new Error("Select at least one item for bulk update.");
  }
  if (ids.length > cap) {
    throw new BulkUpdateCapError(cap, ids.length);
  }

  const query = operatingCompanyId
    ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
    : "";
  const path = `/api/v1/${domain}/${resource}/bulk-update${query}`;

  const raw = await apiRequest<Record<string, unknown>>(path, {
    method: "POST",
    body: {
      ids,
      action,
      payload: payload ?? {},
      ...(reason ? { reason } : {}),
    },
  });

  const normalized = normalizeResponse(raw);
  return {
    ...normalized,
    requested: normalized.requested || ids.length,
    succeeded: normalized.succeeded.length > 0 ? normalized.succeeded : ids,
  };
}
