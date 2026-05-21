export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ProjectionStatus = "pending" | "processed" | "dead_lettered" | "permanently_failed";

export type ProjectionErrorClass =
  | "unsupported_event_type"
  | "signature_invalid"
  | "malformed_payload"
  | "mirror_table_missing"
  | "tenant_context_invalid"
  | "transient_db_error"
  | "fk_violation"
  | "other";

export type ProjectionResult =
  | { success: true }
  | {
      success: false;
      classification: "transient" | "permanent";
      error_class: ProjectionErrorClass;
      error_message: string;
    };

export type SamsaraWebhookEvent = {
  id: string;
  operating_company_id: string;
  event_type: string;
  samsara_event_id: string | null;
  signature_valid: boolean;
  payload: Record<string, unknown>;
  received_at: string;
  projection_attempts: number;
};

export type ProjectionWorkerOptions = {
  batchSize?: number;
  maxRetries?: number;
  retryBackoffMinutes?: number;
};
