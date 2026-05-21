import { pool } from "../auth/db.js";

export type QboSyncOperation = "create" | "update" | "delete" | "sync";

export type QboSyncWithRetryOpts<T> = {
  operatingCompanyId: string;
  entityType: string;
  entityId?: string;
  operation: QboSyncOperation;
  attempt: () => Promise<T>;
  swallow_errors?: boolean;
  replayPayload?: Record<string, unknown>;
};

const INLINE_RETRY_DELAYS_MS = [250, 1000, 4000];
const ALERT_INITIAL_RETRY_MS = 5 * 60 * 1000;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function emitFailureOutbox(operatingCompanyId: string, payload: Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
      "qbo.sync.failed",
      JSON.stringify(payload),
    ]);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

async function persistAlert(input: {
  operatingCompanyId: string;
  entityType: string;
  entityId?: string;
  operation: QboSyncOperation;
  errorCode?: string | null;
  errorMessage: string;
  errorPayload?: Record<string, unknown> | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  severity: "info" | "warning" | "error" | "critical";
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const existsRes = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
    if (!existsRes.rows[0]?.ok) {
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `
        INSERT INTO qbo.sync_alerts (
          operating_company_id,
          entity_type,
          entity_id,
          operation,
          error_code,
          message,
          error_payload,
          retry_count,
          max_retries,
          next_retry_at,
          severity,
          replay_hint
        )
        VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
      `,
      [
        input.operatingCompanyId,
        input.entityType,
        input.entityId ?? null,
        input.operation,
        input.errorCode ?? null,
        input.errorMessage,
        input.errorPayload ? JSON.stringify(input.errorPayload) : null,
        input.retryCount,
        input.maxRetries,
        input.nextRetryAt ? input.nextRetryAt.toISOString() : null,
        input.severity,
        input.errorPayload?.replay_kind ? String(input.errorPayload.replay_kind) : null,
      ]
    );

    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

export async function qboSyncWithRetry<T>(opts: QboSyncWithRetryOpts<T>): Promise<T | null> {
  let lastErr: unknown;
  for (let attemptIdx = 1; attemptIdx <= 3; attemptIdx += 1) {
    try {
      return await opts.attempt();
    } catch (err) {
      lastErr = err;
      if (attemptIdx < 3) {
        await sleep(INLINE_RETRY_DELAYS_MS[attemptIdx - 1] ?? 4000);
      }
    }
  }

  const message = String((lastErr as Error)?.message ?? "qbo_sync_failed");
  const status = Number((lastErr as { status?: number }).status ?? 0);
  const bodyPreview = String((lastErr as { bodyPreview?: string }).bodyPreview ?? "");

  const errorPayload = {
    ...(opts.replayPayload ?? {}),
    status,
    body_preview: bodyPreview.slice(0, 500),
  };

  await persistAlert({
    operatingCompanyId: opts.operatingCompanyId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    operation: opts.operation,
    errorCode: status ? `http_${status}` : "unknown",
    errorMessage: message.slice(0, 2000),
    errorPayload,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: new Date(Date.now() + ALERT_INITIAL_RETRY_MS),
    severity: "warning",
  });

  await emitFailureOutbox(opts.operatingCompanyId, {
    entity_type: opts.entityType,
    entity_id: opts.entityId ?? null,
    operation: opts.operation,
    error_message: message,
    replay_payload: opts.replayPayload ?? null,
  });

  if (!opts.swallow_errors) {
    throw lastErr instanceof Error ? lastErr : new Error(message);
  }

  return null;
}
