import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runQboCdcIngest } from "../integrations/qbo/qbo-cdc.service.js";
import { qboCompanyContext, qboQuery } from "../integrations/qbo/qbo-client.js";
import { runForensicImportDeduped } from "../integrations/qbo/forensic-import.service.js";
import { auditBatchEvent, auditForensicImportError } from "../integrations/qbo/forensic-audit.service.js";
import { runSamsaraHealthCheckForRow } from "../integrations/samsara/samsara.service.js";
import { runAdminDeepHealthProbe } from "./health-deep.service.js";

export type AdminJobStatus = "queued" | "running" | "completed" | "failed";

export type AdminJobOperation =
  | "qbo.inbound.replay_since"
  | "admin.health.deep.refresh"
  | "qbo.forensic.start_import"
  | "samsara.config.health_check";

export type AdminJobRecord = {
  id: string;
  operation: AdminJobOperation;
  operating_company_id: string;
  requested_by_user_id: string | null;
  idempotency_key: string;
  status: AdminJobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  last_error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EnqueueInput = {
  operation: AdminJobOperation;
  operatingCompanyId: string;
  requestedByUserId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
};

function hashKey(input: Record<string, unknown>) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function buildIdempotencyKey(input:
  | { operation: "qbo.inbound.replay_since"; operatingCompanyId: string; realmId: string; sinceIso: string }
  | { operation: "admin.health.deep.refresh"; operatingCompanyId: string; integration: string; nowMs: number }
  | { operation: "qbo.forensic.start_import"; operatingCompanyId: string; importBatchId: string }
  | { operation: "samsara.config.health_check"; operatingCompanyId: string; samsaraConfigId: string; configVersion: string }) {
  if (input.operation === "qbo.inbound.replay_since") {
    // F-005 key: same (company, realm, since) replay requests coalesce.
    return hashKey({
      op: input.operation,
      operating_company_id: input.operatingCompanyId,
      realm_id: input.realmId,
      since_iso: input.sinceIso,
    });
  }
  if (input.operation === "admin.health.deep.refresh") {
    // F-006 key: minute bucket coalescing prevents stale-cache request storms.
    const minuteBucket = Math.floor(input.nowMs / 60_000);
    return hashKey({
      op: input.operation,
      operating_company_id: input.operatingCompanyId,
      integration: input.integration,
      minute_bucket: minuteBucket,
    });
  }
  if (input.operation === "qbo.forensic.start_import") {
    // F-007 key: batch-specific dedupe; same import batch should never run twice.
    return hashKey({
      op: input.operation,
      operating_company_id: input.operatingCompanyId,
      import_batch_id: input.importBatchId,
    });
  }
  // S-002 key: config-version specific dedupe; same config version probes once.
  return hashKey({
    op: input.operation,
    operating_company_id: input.operatingCompanyId,
    samsara_config_id: input.samsaraConfigId,
    config_version: input.configVersion,
  });
}

async function appendAdminJobAudit(
  eventClass: string,
  operatingCompanyId: string,
  severity: "info" | "warning",
  payload: Record<string, unknown>,
  actorUserId?: string | null
) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      actorUserId ?? null,
      "DS-REMEDIATE-1-ADMIN-JOBS",
    ]);
  });
}

export async function resolveDefaultOperatingCompanyIdForUser(userId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ default_company_id: string | null }>(
      `SELECT default_company_id::text AS default_company_id FROM identity.users WHERE id = $1::uuid LIMIT 1`,
      [userId]
    );
    return res.rows[0]?.default_company_id ?? null;
  });
}

export async function enqueueAdminJob(input: EnqueueInput): Promise<string> {
  const maxAttempts = Math.min(10, Math.max(1, input.maxAttempts ?? 3));
  const row = await withLuciaBypass(async (client) => {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM _system.admin_jobs
        WHERE operation = $1
          AND idempotency_key = $2
          AND status IN ('queued', 'running')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.operation, input.idempotencyKey]
    );
    if (existing.rows[0]?.id) return existing.rows[0].id;

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO _system.admin_jobs (
          operation,
          operating_company_id,
          requested_by_user_id,
          idempotency_key,
          status,
          payload,
          attempt_count,
          max_attempts,
          next_attempt_at
        ) VALUES ($1, $2::uuid, $3::uuid, $4, 'queued', $5::jsonb, 0, $6, now())
        RETURNING id::text
      `,
      [input.operation, input.operatingCompanyId, input.requestedByUserId, input.idempotencyKey, JSON.stringify(input.payload), maxAttempts]
    );
    return inserted.rows[0].id;
  });

  await appendAdminJobAudit(
    "admin.jobs.enqueued",
    input.operatingCompanyId,
    "info",
    { operation: input.operation, job_id: row },
    input.requestedByUserId
  );
  return row;
}

export async function getAdminJobById(jobId: string): Promise<AdminJobRecord | null> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<AdminJobRecord>(
      `
        SELECT
          id::text,
          operation,
          operating_company_id::text,
          requested_by_user_id::text,
          idempotency_key,
          status,
          payload,
          result,
          last_error_message,
          attempt_count,
          max_attempts,
          next_attempt_at::text,
          started_at::text,
          completed_at::text,
          created_at::text,
          updated_at::text
        FROM _system.admin_jobs
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [jobId]
    );
    return res.rows[0] ?? null;
  });
}

export async function getLatestCompletedAdminJob(
  operation: AdminJobOperation,
  operatingCompanyId: string
): Promise<AdminJobRecord | null> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<AdminJobRecord>(
      `
        SELECT
          id::text,
          operation,
          operating_company_id::text,
          requested_by_user_id::text,
          idempotency_key,
          status,
          payload,
          result,
          last_error_message,
          attempt_count,
          max_attempts,
          next_attempt_at::text,
          started_at::text,
          completed_at::text,
          created_at::text,
          updated_at::text
        FROM _system.admin_jobs
        WHERE operation = $1
          AND operating_company_id = $2::uuid
          AND status = 'completed'
        ORDER BY completed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `,
      [operation, operatingCompanyId]
    );
    return res.rows[0] ?? null;
  });
}

function computeRetryBackoffMs(attemptCount: number) {
  const exp = Math.min(Math.max(attemptCount, 1), 10);
  return Math.min(60 * 60 * 1000, Math.pow(2, exp) * 30_000);
}

async function claimAdminJobs(limit = 10): Promise<AdminJobRecord[]> {
  return withLuciaBypass(async (client) => {
    const sel = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM _system.admin_jobs
        WHERE status IN ('queued', 'failed')
          AND next_attempt_at <= now()
          AND attempt_count < max_attempts
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [limit]
    );
    if (sel.rows.length === 0) return [];

    const ids = sel.rows.map((row) => row.id);
    const upd = await client.query<AdminJobRecord>(
      `
        UPDATE _system.admin_jobs
        SET
          status = 'running',
          attempt_count = attempt_count + 1,
          started_at = COALESCE(started_at, now()),
          updated_at = now(),
          last_error_message = NULL
        WHERE id = ANY($1::uuid[])
        RETURNING
          id::text,
          operation,
          operating_company_id::text,
          requested_by_user_id::text,
          idempotency_key,
          status,
          payload,
          result,
          last_error_message,
          attempt_count,
          max_attempts,
          next_attempt_at::text,
          started_at::text,
          completed_at::text,
          created_at::text,
          updated_at::text
      `,
      [ids]
    );
    return upd.rows;
  });
}

async function markJobCompleted(job: AdminJobRecord, result: Record<string, unknown>) {
  await withLuciaBypass(async (client) => {
    await client.query(
      `
        UPDATE _system.admin_jobs
        SET
          status = 'completed',
          result = $2::jsonb,
          completed_at = now(),
          updated_at = now(),
          next_attempt_at = now()
        WHERE id = $1::uuid
      `,
      [job.id, JSON.stringify(result)]
    );
  });
  await appendAdminJobAudit(
    "admin.jobs.completed",
    job.operating_company_id,
    "info",
    { operation: job.operation, job_id: job.id },
    job.requested_by_user_id
  );
}

async function markJobFailed(job: AdminJobRecord, errorMessage: string) {
  const isTerminal = job.attempt_count >= job.max_attempts;
  const nextAttemptAt = isTerminal ? null : new Date(Date.now() + computeRetryBackoffMs(job.attempt_count)).toISOString();
  await withLuciaBypass(async (client) => {
    await client.query(
      `
        UPDATE _system.admin_jobs
        SET
          status = 'failed',
          last_error_message = $2,
          next_attempt_at = COALESCE($3::timestamptz, next_attempt_at),
          completed_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [job.id, errorMessage.slice(0, 2000), nextAttemptAt, isTerminal]
    );
  });
  await appendAdminJobAudit(
    "admin.jobs.failed",
    job.operating_company_id,
    "warning",
    { operation: job.operation, job_id: job.id, terminal: isTerminal, error: errorMessage.slice(0, 500) },
    job.requested_by_user_id
  );
}

async function runOperation(job: AdminJobRecord): Promise<Record<string, unknown>> {
  if (!job.operating_company_id) throw new Error("missing_operating_company_id");

  if (job.operation === "qbo.inbound.replay_since") {
    const realm = String(job.payload.realm_id ?? "").trim();
    const sinceIso = String(job.payload.since_iso ?? "").trim();
    if (!realm || !sinceIso) throw new Error("invalid_payload_replay_since");
    const result = await runQboCdcIngest({
      operating_company_id: job.operating_company_id,
      qbo_realm_id: realm,
      changed_since_override_iso: sinceIso,
      triggered_by: "manual_replay",
      logWarning: (msg, meta) => console.warn("[admin-jobs][qbo.inbound.replay_since]", msg, meta ?? {}),
    });
    return { ok: true, ...result };
  }

  if (job.operation === "admin.health.deep.refresh") {
    const probe = await runAdminDeepHealthProbe();
    const criticalOk = probe.checks.filter((check) => check.tier === "critical").every((check) => check.ok);
    return { ok: criticalOk, checks: probe.checks, total_ms: probe.total_ms, last_probed_at: new Date().toISOString() };
  }

  if (job.operation === "qbo.forensic.start_import") {
    const batchId = String(job.payload.batch_id ?? "").trim();
    const sinceDate = String(job.payload.since_date ?? "2015-01-01");
    const attachmentsSinceDate = String(job.payload.attachments_since_date ?? "2021-01-01");
    if (!batchId) throw new Error("invalid_payload_forensic_start_import");

    try {
      const context = await qboCompanyContext(job.operating_company_id);
      await qboQuery(context, "SELECT * FROM CompanyInfo");
    } catch (error) {
      const detail = String((error as Error)?.message ?? "qbo_preflight_failed");
      await withLuciaBypass(async (client) => {
        await client.query(
          `
            UPDATE qbo_archive.import_batches
            SET status = 'failed',
                completed_at = now(),
                errors_count = errors_count + 1,
                last_error_message = $2,
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [batchId, detail.slice(0, 500)]
        );
      });
      await auditBatchEvent(batchId, job.operating_company_id, "preflight_qbo_check_failed", {
        error_message: detail.slice(0, 500),
      });
      throw error;
    }
    await appendAdminJobAudit(
      "qbo_archive.batch.preflight_passed",
      job.operating_company_id,
      "info",
      { operating_company_id: job.operating_company_id, batch_id: batchId, started_from_job_id: job.id },
      job.requested_by_user_id
    );
    await auditBatchEvent(batchId, job.operating_company_id, "preflight_qbo_check_passed");

    const actorId = job.requested_by_user_id;
    if (!actorId) throw new Error("missing_requested_by_user_id");
    void runForensicImportDeduped(actorId, {
      batchId,
      operatingCompanyId: job.operating_company_id,
      sinceDate,
      attachmentsSinceDate,
    }).catch(async (error) => {
      await auditForensicImportError(
        batchId,
        job.operating_company_id,
        error instanceof Error ? error : new Error(String(error)),
        { phase: "admin", step: "runForensicImportDeduped" }
      );
    });
    return { ok: true, batch_id: batchId, import_dispatched: true };
  }

  if (job.operation === "samsara.config.health_check") {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [job.operating_company_id]);
      await runSamsaraHealthCheckForRow(client, job.operating_company_id);
    });
    return { ok: true };
  }

  throw new Error(`unsupported_admin_operation:${job.operation}`);
}

export async function runAdminJobsWorkerOnce(log?: FastifyInstance["log"]) {
  const claimed = await claimAdminJobs(10);
  if (claimed.length === 0) return { processed: 0 };

  for (const job of claimed) {
    try {
      await appendAdminJobAudit(
        "admin.jobs.started",
        job.operating_company_id,
        "info",
        { operation: job.operation, job_id: job.id, attempt: job.attempt_count },
        job.requested_by_user_id
      );
      const result = await runOperation(job);
      await markJobCompleted(job, result);
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      log?.warn({ err: error, jobId: job.id, operation: job.operation }, "[admin-jobs] run_failed");
      await markJobFailed(job, message);
    }
  }

  return { processed: claimed.length };
}

let workerTimer: NodeJS.Timeout | undefined;

export function initializeAdminJobsWorker(app: FastifyInstance) {
  if (workerTimer) return;
  if (process.env.ENABLE_ADMIN_JOBS_WORKER === "false") {
    app.log.info("[admin-jobs] disabled via ENABLE_ADMIN_JOBS_WORKER=false");
    return;
  }
  const intervalMs = Math.max(5_000, Number(process.env.ADMIN_JOBS_WORKER_INTERVAL_MS ?? 20_000));
  workerTimer = setInterval(() => {
    void wrapBackgroundJobTick(
      "admin.jobs.worker",
      async () => {
        await runAdminJobsWorkerOnce(app.log);
      },
      app.log
    );
  }, intervalMs);
  if (typeof workerTimer.unref === "function") workerTimer.unref();
  app.log.info({ intervalMs }, "[admin-jobs] worker started");
}

export function stopAdminJobsWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = undefined;
}
