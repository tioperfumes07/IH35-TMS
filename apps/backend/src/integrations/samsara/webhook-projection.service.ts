import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { projectDriverEvent } from "./webhook-projectors/driver-projector.js";
import { projectHosEvent } from "./webhook-projectors/hos-projector.js";
import { projectVehicleEvent } from "./webhook-projectors/vehicle-projector.js";
import type {
  DbClient,
  ProjectionErrorClass,
  ProjectionResult,
  ProjectionWorkerOptions,
  ProjectionStatus,
  SamsaraWebhookEvent,
} from "./webhook-projection.types.js";

const AUDIT_SOURCE = "DS-REMEDIATE-7";
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MINUTES = 5;

type RawWebhookEventRow = {
  id: string;
  operating_company_id: string;
  event_type: string;
  samsara_event_id: string | null;
  signature_valid: boolean;
  payload: Record<string, unknown>;
  received_at: string;
  projection_attempts: number;
};

function toErrorMessage(error: unknown): string {
  return String((error as Error)?.message ?? error);
}

async function appendAuditEvent(
  client: DbClient,
  eventClass: string,
  severity: "info" | "warning",
  payload: Record<string, unknown>
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    AUDIT_SOURCE,
  ]);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveBatchSize(input?: number): number {
  if (Number.isFinite(input) && Number(input) > 0) return Math.floor(Number(input));
  return parsePositiveInt(process.env.SAMSARA_PROJECTION_BATCH_SIZE, DEFAULT_BATCH_SIZE);
}

export function computeNextRetryAt(
  projectionAttempts: number,
  retryBackoffMinutes = DEFAULT_RETRY_BACKOFF_MINUTES
): Date {
  const minutes = Math.max(1, projectionAttempts) * Math.max(1, retryBackoffMinutes);
  return new Date(Date.now() + minutes * 60_000);
}

function classifyThrownError(error: unknown): {
  classification: "transient" | "permanent";
  error_class: ProjectionErrorClass;
  error_message: string;
} {
  const message = toErrorMessage(error);
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (message.includes("empty operating_company_id") || message.includes("malformed operating_company_id")) {
    return {
      classification: "permanent",
      error_class: "tenant_context_invalid",
      error_message: message,
    };
  }
  if (code === "23503") {
    return {
      classification: "transient",
      error_class: "fk_violation",
      error_message: message,
    };
  }
  if (["40001", "40P01", "55P03", "57014"].includes(code)) {
    return {
      classification: "transient",
      error_class: "transient_db_error",
      error_message: message,
    };
  }
  return {
    classification: "permanent",
    error_class: "other",
    error_message: message,
  };
}

function routeProjector(eventType: string): "driver" | "vehicle" | "hos" | "missing_mirror" | "unsupported" {
  const normalized = eventType.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "unknown") return "unsupported";
  if (normalized.includes("hos") || normalized.includes("eld") || normalized.includes("duty_status")) return "hos";
  if (normalized.startsWith("driver.")) return "driver";
  if (normalized.startsWith("vehicle.")) return "vehicle";
  return "missing_mirror";
}

async function projectEvent(client: DbClient, event: SamsaraWebhookEvent): Promise<ProjectionResult> {
  if (!event.signature_valid) {
    return {
      success: false,
      classification: "permanent",
      error_class: "signature_invalid",
      error_message: "signature_invalid",
    };
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return {
      success: false,
      classification: "permanent",
      error_class: "malformed_payload",
      error_message: "payload is not an object",
    };
  }
  const route = routeProjector(event.event_type);
  if (route === "driver") return projectDriverEvent(client, event);
  if (route === "vehicle") return projectVehicleEvent(client, event);
  if (route === "hos") return projectHosEvent(client, event);
  if (route === "unsupported") {
    return {
      success: false,
      classification: "permanent",
      error_class: "unsupported_event_type",
      error_message: `unsupported event_type: ${event.event_type}`,
    };
  }
  return {
    success: false,
    classification: "permanent",
    error_class: "mirror_table_missing",
    error_message: `no mirror projector for event_type: ${event.event_type}`,
  };
}

async function ensureProjectionStateRow(client: DbClient, event: RawWebhookEventRow) {
  await client.query(
    `
      INSERT INTO integrations.samsara_webhook_projection_state (
        webhook_event_id,
        operating_company_id,
        projection_status,
        projection_attempts,
        samsara_event_id
      )
      VALUES ($1::uuid, $2::uuid, 'pending', 0, $3)
      ON CONFLICT (webhook_event_id) DO NOTHING
    `,
    [event.id, event.operating_company_id, event.samsara_event_id]
  );
}

async function fetchPendingEvents(client: DbClient, operatingCompanyId: string, batchSize: number): Promise<RawWebhookEventRow[]> {
  const res = await client.query<RawWebhookEventRow>(
    `
      SELECT
        e.id::text,
        e.operating_company_id::text,
        e.event_type,
        e.samsara_event_id,
        e.signature_valid,
        e.payload,
        e.received_at::text,
        COALESCE(s.projection_attempts, 0)::int AS projection_attempts
      FROM integrations.samsara_webhook_events e
      LEFT JOIN integrations.samsara_webhook_projection_state s
        ON s.webhook_event_id = e.id
      WHERE e.operating_company_id = $1::uuid
        AND (
          s.webhook_event_id IS NULL
          OR (
            s.projection_status = 'pending'
            AND (s.next_retry_at IS NULL OR s.next_retry_at <= now())
          )
        )
      ORDER BY e.received_at ASC, e.id ASC
      LIMIT $2
    `,
    [operatingCompanyId, batchSize]
  );
  return res.rows;
}

async function updateProjectionState(
  client: DbClient,
  event: RawWebhookEventRow,
  input: {
    status: ProjectionStatus;
    attempts: number;
    errorClass?: ProjectionErrorClass;
    errorMessage?: string;
    nextRetryAt?: Date | null;
  }
) {
  await client.query(
    `
      UPDATE integrations.samsara_webhook_projection_state
      SET
        projection_status = $2,
        projection_attempts = $3,
        projection_error_class = $4,
        projection_error = $5,
        last_projection_attempt_at = now(),
        next_retry_at = $6
      WHERE webhook_event_id = $1::uuid
    `,
    [
      event.id,
      input.status,
      input.attempts,
      input.errorClass ?? null,
      input.errorMessage ?? null,
      input.nextRetryAt ? input.nextRetryAt.toISOString() : null,
    ]
  );
}

async function processSingleEvent(
  client: DbClient,
  event: RawWebhookEventRow,
  options: { maxRetries: number; retryBackoffMinutes: number }
) {
  const attempts = event.projection_attempts + 1;
  try {
    assertTenantContext(event.operating_company_id, "samsara.webhook_projection_cron");
    const result = await projectEvent(client, event as SamsaraWebhookEvent);
    if (result.success) {
      await updateProjectionState(client, event, { status: "processed", attempts, nextRetryAt: null });
      await appendAuditEvent(client, "webhook_projection_succeeded", "info", {
        webhook_event_id: event.id,
        samsara_event_id: event.samsara_event_id,
        event_type: event.event_type,
        operating_company_id: event.operating_company_id,
      });
      return;
    }
    if (result.classification === "permanent") {
      await updateProjectionState(client, event, {
        status: "dead_lettered",
        attempts,
        errorClass: result.error_class,
        errorMessage: result.error_message,
        nextRetryAt: null,
      });
      await appendAuditEvent(client, "webhook_projection_dead_lettered", "warning", {
        webhook_event_id: event.id,
        samsara_event_id: event.samsara_event_id,
        event_type: event.event_type,
        operating_company_id: event.operating_company_id,
        error_class: result.error_class,
        error: result.error_message,
      });
      return;
    }
    if (attempts >= options.maxRetries) {
      await updateProjectionState(client, event, {
        status: "permanently_failed",
        attempts,
        errorClass: result.error_class,
        errorMessage: result.error_message,
        nextRetryAt: null,
      });
      await appendAuditEvent(client, "webhook_projection_permanently_failed", "warning", {
        webhook_event_id: event.id,
        samsara_event_id: event.samsara_event_id,
        event_type: event.event_type,
        operating_company_id: event.operating_company_id,
        error_class: result.error_class,
        error: result.error_message,
      });
      return;
    }
    const nextRetryAt = computeNextRetryAt(attempts, options.retryBackoffMinutes);
    await updateProjectionState(client, event, {
      status: "pending",
      attempts,
      errorClass: result.error_class,
      errorMessage: result.error_message,
      nextRetryAt,
    });
    await appendAuditEvent(client, "webhook_projection_retry_scheduled", "warning", {
      webhook_event_id: event.id,
      samsara_event_id: event.samsara_event_id,
      event_type: event.event_type,
      operating_company_id: event.operating_company_id,
      error_class: result.error_class,
      error: result.error_message,
      next_retry_at: nextRetryAt.toISOString(),
      attempt: attempts,
    });
  } catch (error) {
    const classified = classifyThrownError(error);
    if (classified.classification === "transient" && attempts < options.maxRetries) {
      const nextRetryAt = computeNextRetryAt(attempts, options.retryBackoffMinutes);
      await updateProjectionState(client, event, {
        status: "pending",
        attempts,
        errorClass: classified.error_class,
        errorMessage: classified.error_message,
        nextRetryAt,
      });
      await appendAuditEvent(client, "webhook_projection_retry_scheduled", "warning", {
        webhook_event_id: event.id,
        samsara_event_id: event.samsara_event_id,
        event_type: event.event_type,
        operating_company_id: event.operating_company_id,
        error_class: classified.error_class,
        error: classified.error_message,
        next_retry_at: nextRetryAt.toISOString(),
        attempt: attempts,
      });
      return;
    }

    const terminalStatus: ProjectionStatus =
      classified.classification === "transient" ? "permanently_failed" : "dead_lettered";
    await updateProjectionState(client, event, {
      status: terminalStatus,
      attempts,
      errorClass: classified.error_class,
      errorMessage: classified.error_message,
      nextRetryAt: null,
    });
    await appendAuditEvent(
      client,
      terminalStatus === "permanently_failed"
        ? "webhook_projection_permanently_failed"
        : "webhook_projection_dead_lettered",
      "warning",
      {
        webhook_event_id: event.id,
        samsara_event_id: event.samsara_event_id,
        event_type: event.event_type,
        operating_company_id: event.operating_company_id,
        error_class: classified.error_class,
        error: classified.error_message,
      }
    );
  }
}

export async function projectSamsaraWebhookEventsForTenant(
  client: DbClient,
  operatingCompanyId: string,
  options: ProjectionWorkerOptions = {}
): Promise<{ processed: number }> {
  assertTenantContext(operatingCompanyId, "samsara.webhook_projection_cron");
  const batchSize = resolveBatchSize(options.batchSize);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBackoffMinutes = options.retryBackoffMinutes ?? DEFAULT_RETRY_BACKOFF_MINUTES;

  await appendAuditEvent(client, "webhook_projection_started", "info", {
    operating_company_id: operatingCompanyId,
    batch_size: batchSize,
  });

  const pending = await fetchPendingEvents(client, operatingCompanyId, batchSize);
  if (pending.length === 0) {
    await appendAuditEvent(client, "cron_no_pending_webhooks", "info", {
      operating_company_id: operatingCompanyId,
      cron_name: "samsara.webhook_projection_cron",
    });
    return { processed: 0 };
  }

  for (const event of pending) {
    await ensureProjectionStateRow(client, event);
    await processSingleEvent(client, event, { maxRetries, retryBackoffMinutes });
  }

  return { processed: pending.length };
}
