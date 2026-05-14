import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { pool, withLuciaBypass } from "../../auth/db.js";
import { enqueueSyncJob, type QueueEntityType } from "./qbo-sync.service.js";
import { notifyQboSyncDeadLetter } from "../../qbo/sync-alert-notifier.js";

export type SyncRunRow = {
  id: string;
  operating_company_id: string;
  kind: string;
  status: string;
  retry_count: number;
  payload: Record<string, unknown> | null;
};

function hashPayload(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input ?? {})).digest("hex");
}

export function computeSyncRunBackoffMs(retryCountAfterFailure: number): number {
  const exp = Math.min(Math.max(retryCountAfterFailure, 1), 16);
  return Math.pow(2, exp) * 60_000;
}

const QUEUE_ENTITY_TYPES = new Set<string>([
  "bank_transaction",
  "bill",
  "bill_payment",
  "expense",
  "invoice",
  "journal_entry",
  "settlement",
  "transfer",
]);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`sync_run_timeout:${label}`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function executeSyncRun(row: SyncRunRow): Promise<void> {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const strategy = String(payload.strategy ?? "enqueue_qbo_sync_queue");

  if (strategy === "noop") {
    return;
  }

  if (strategy !== "enqueue_qbo_sync_queue") {
    throw new Error(`unsupported_sync_strategy:${strategy}`);
  }

  const entityType = String(payload.entity_type ?? "");
  const entityId = String(payload.entity_id ?? "");
  if (!QUEUE_ENTITY_TYPES.has(entityType) || !entityId) {
    throw new Error("invalid_sync_payload_missing_entity");
  }

  const hash = hashPayload({
    sync_run_id: row.id,
    kind: row.kind,
    entity_type: entityType,
    entity_id: entityId,
  });

  await enqueueSyncJob(row.operating_company_id, entityType as QueueEntityType, entityId, hash);
}

async function markSuccess(runId: string) {
  await withLuciaBypass(async (client: PoolClient) => {
    await client.query(
      `
        UPDATE qbo.sync_runs
        SET status = 'success',
            completed_at = now(),
            error_message = NULL,
            next_retry_at = NULL,
            records_processed = COALESCE(records_processed, 0) + 1
        WHERE id = $1::uuid
      `,
      [runId]
    );
  });
}

async function insertCriticalAlert(input: {
  operatingCompanyId: string;
  syncRunId: string;
  kind: string;
  message: string;
}) {
  await withLuciaBypass(async (client: PoolClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const existsRes = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
    if (!existsRes.rows[0]?.ok) return;

    await client.query(
      `
        INSERT INTO qbo.sync_alerts (
          operating_company_id,
          entity_type,
          entity_id,
          operation,
          error_code,
          error_message,
          error_payload,
          retry_count,
          max_retries,
          next_retry_at,
          severity,
          replay_hint
        )
        VALUES (
          $1,
          'sync_run',
          $2::uuid,
          'sync',
          'dead_letter',
          $3,
          $4::jsonb,
          5,
          5,
          NULL,
          'critical',
          $5
        )
      `,
      [
        input.operatingCompanyId,
        input.syncRunId,
        input.message.slice(0, 2000),
        JSON.stringify({ kind: input.kind, sync_run_id: input.syncRunId }),
        input.kind,
      ]
    );
  });
}

async function finalizeFailure(row: SyncRunRow, err: unknown) {
  const message = String((err as Error)?.message ?? "sync_failed").slice(0, 2000);
  const nextRetryCount = Number(row.retry_count ?? 0) + 1;

  if (nextRetryCount >= 5) {
    await withLuciaBypass(async (client: PoolClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [row.operating_company_id]);
      await client.query(
        `
          UPDATE qbo.sync_runs
          SET status = 'dead_letter',
              retry_count = $2,
              completed_at = now(),
              dead_letter_at = now(),
              error_message = $3,
              next_retry_at = NULL
          WHERE id = $1::uuid
        `,
        [row.id, nextRetryCount, message]
      );
    });

    await insertCriticalAlert({
      operatingCompanyId: row.operating_company_id,
      syncRunId: row.id,
      kind: row.kind,
      message,
    });

    const notify = await notifyQboSyncDeadLetter({
      operatingCompanyId: row.operating_company_id,
      kind: row.kind,
      syncRunId: row.id,
      errorMessage: message,
    });

    await withLuciaBypass(async (client: PoolClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [row.operating_company_id]);
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
        "qbo.sync_dead_letter",
        "warning",
        JSON.stringify({
          sync_run_id: row.id,
          operating_company_id: row.operating_company_id,
          kind: row.kind,
          error_message: message,
          email_sent: notify.sent,
        }),
        "P6-T11199-QBO-SYNC-WORKER",
      ]);
    });
    return;
  }

  const backoffMs = computeSyncRunBackoffMs(nextRetryCount);
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

  await withLuciaBypass(async (client: PoolClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [row.operating_company_id]);
    await client.query(
      `
        UPDATE qbo.sync_runs
        SET status = 'failed',
            retry_count = $2,
            error_message = $3,
            completed_at = NULL,
            next_retry_at = $4::timestamptz
        WHERE id = $1::uuid
      `,
      [row.id, nextRetryCount, message, nextRetryAt]
    );
  });
}

export async function processQboSyncRunsOnce(log?: FastifyInstance["log"]): Promise<{ processed: number }> {
  const client = await pool.connect();
  let claimed: SyncRunRow[] = [];
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const reg = await client.query(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) {
      await client.query("COMMIT");
      return { processed: 0 };
    }

    const sel = await client.query<SyncRunRow>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          kind,
          status,
          retry_count,
          payload
        FROM qbo.sync_runs
        WHERE (
            status = 'pending'
            OR (
              status = 'failed'
              AND retry_count < 5
              AND (next_retry_at IS NULL OR next_retry_at <= now())
            )
          )
          AND status <> 'dead_letter'
        ORDER BY COALESCE(next_retry_at, started_at) ASC NULLS LAST
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `
    );

    claimed = sel.rows.map((r: SyncRunRow) => ({
      ...r,
      payload: (r.payload as Record<string, unknown> | null) ?? {},
    }));

    if (claimed.length === 0) {
      await client.query("COMMIT");
      return { processed: 0 };
    }

    await client.query(
      `
        UPDATE qbo.sync_runs
        SET status = 'running',
            started_at = COALESCE(started_at, now()),
            error_message = NULL
        WHERE id = ANY($1::uuid[])
      `,
      [claimed.map((r) => r.id)]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    log?.error({ err: error }, "[qbo-sync-worker] claim_failed");
    return { processed: 0 };
  } finally {
    client.release();
  }

  for (const row of claimed) {
    try {
      await withTimeout(executeSyncRun(row), 30_000, row.id);
      await markSuccess(row.id);
    } catch (error) {
      log?.warn({ err: error, sync_run_id: row.id }, "[qbo-sync-worker] attempt_failed");
      await finalizeFailure(row, error);
    }
  }

  return { processed: claimed.length };
}

let workerTimer: NodeJS.Timeout | undefined;

export function initializeQboSyncWorker(app: FastifyInstance) {
  if (workerTimer) return;
  if (process.env.ENABLE_QBO_SYNC_RUN_WORKER === "false") {
    app.log.info("[qbo-sync-worker] disabled via ENABLE_QBO_SYNC_RUN_WORKER=false");
    return;
  }

  const intervalMs = Math.max(5_000, Number(process.env.QBO_SYNC_WORKER_INTERVAL_MS ?? 30_000));
  workerTimer = setInterval(() => {
    void processQboSyncRunsOnce(app.log).catch((error) => app.log.error({ err: error }, "[qbo-sync-worker] tick_failed"));
  }, intervalMs);
  if (typeof workerTimer.unref === "function") workerTimer.unref();

  app.log.info({ intervalMs }, "[qbo-sync-worker] started");
}

export function stopQboSyncWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = undefined;
}
