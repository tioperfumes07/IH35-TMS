export type BulkUpdateRequest = {
  ids: string[];
  action: string;
  payload: Record<string, unknown>;
  reason?: string;
};

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

export type BulkPerEntityResult =
  | { ok: true; auditLogId?: string }
  | { ok: false; code: string; message: string };

export type BulkPerEntityContext<TPayload> = {
  id: string;
  action: string;
  payload: TPayload;
  reason?: string;
  operatingCompanyId: string;
  actorUserId: string;
  bulkCallId: string;
  client: {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  };
};
