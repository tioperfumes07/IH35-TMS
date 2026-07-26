import type { FastifyInstance } from "fastify";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { withLuciaBypass } from "../auth/db.js";
import { getAppReady } from "../lib/startup-ready.js";
import { createResilientRedis, type RedisHealthStatus } from "../lib/redis.client.js";
import { logger } from "../observability/structured-logger.js";

export type HealthCheck = {
  name: string;
  ok: boolean;
  tier: "critical" | "warning";
  duration_ms: number;
  /**
   * PUBLIC field. Only ever a bounded code from the vocabulary below — NEVER driver text.
   * See the SEC-HEALTHZ-01 note on `toPublicHealthErrorCode`.
   */
  error?: string;
  status?: RedisHealthStatus;
};

// ── SEC-HEALTHZ-01 — the /api/v1/healthz body is world-readable ────────────────────────────────
// `GET /api/v1/healthz` is UNAUTHENTICATED: session-middleware.ts returns from its preHandler for
// every url starting `/api/v1/healthz` (so req.user is never populated on this route) and
// csrf-origin-guard.ts exempts the same prefix. Anything this handler puts in the body is readable
// by an anonymous caller on the public internet.
//
// It used to answer a failed check with `String((error as Error)?.message ?? error)` — the raw
// driver message. pg errors carry host, port, database name, DB role, schema and relation names;
// ioredis errors carry `connect ECONNREFUSED <host>:<port>`; the S3/R2 client carries the account
// id in its endpoint. That is a latent information disclosure, and it was one dependency upgrade
// away from getting worse.
//
// ROOT-CAUSE FIX — not a scrubber, not a blocklist. A check may only publish a code it
// DELIBERATELY declared: `HealthCheckError` carries a bounded `publicCode` drawn from a fixed
// vocabulary of our own literals with no interpolated values. EVERY other error — every driver
// error, including drivers we have not adopted yet — collapses to `HEALTH_ERROR_GENERIC`. A
// blocklist leaks the next new driver; a declare-to-publish rule structurally cannot.
//
// The real error is NOT swallowed: `logHealthCheckFailure` writes it server-side at full fidelity
// (message + stack, via the structured logger) before the generic code is returned. Operators lose
// nothing; anonymous callers learn nothing.
//
// The rest of the response shape is unchanged on purpose — `name`, `ok`, `tier`, `duration_ms`,
// the 200/503 split and `/healthz/shallow`'s `{version}` are consumed by deploy verification
// (CLAUDE.md workflow step 7), scripts/verify-deploy-parity.mjs and the System module page.
export const HEALTH_ERROR_GENERIC = "check_failed";

/** A public health code is a fixed literal: lowercase, underscores, no interpolated values. */
const PUBLIC_HEALTH_CODE = /^[a-z0-9_]{1,48}$/;

/**
 * A check failure the endpoint is ALLOWED to name publicly. `publicCode` is the bounded token that
 * reaches anonymous callers; `detail` (counts, job names, stack) stays in the server-side log only.
 */
export class HealthCheckError extends Error {
  readonly publicCode: string;

  constructor(publicCode: string, detail?: string) {
    super(detail ? `${publicCode}: ${detail}` : publicCode);
    this.name = "HealthCheckError";
    // Fail closed: an out-of-vocabulary code is treated as undeclared.
    this.publicCode = PUBLIC_HEALTH_CODE.test(publicCode) ? publicCode : HEALTH_ERROR_GENERIC;
  }
}

/** The ONLY way an error may become response text. Undeclared ⇒ generic. */
export function toPublicHealthErrorCode(error: unknown): string {
  if (error instanceof HealthCheckError && PUBLIC_HEALTH_CODE.test(error.publicCode)) {
    return error.publicCode;
  }
  return HEALTH_ERROR_GENERIC;
}

/** Full-fidelity server-side record of what the public body deliberately omits. */
function logHealthCheckFailure(name: string, tier: HealthCheck["tier"], durationMs: number, error: unknown): void {
  logger.error("health_check_failed", error, {
    check: name,
    tier,
    latency_ms: durationMs,
    public_code: toPublicHealthErrorCode(error),
    // Server-side only. This is the string that must never reach the unauthenticated response.
    internal_error: error instanceof Error ? error.message : String(error),
  });
}

async function promiseTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new HealthCheckError("timeout", `after_${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

async function timed(name: string, tier: HealthCheck["tier"], fn: () => Promise<void>): Promise<HealthCheck> {
  const started = Date.now();
  try {
    await fn();
    return { name, ok: true, tier, duration_ms: Date.now() - started };
  } catch (error) {
    const durationMs = Date.now() - started;
    logHealthCheckFailure(name, tier, durationMs, error);
    return {
      name,
      ok: false,
      tier,
      duration_ms: durationMs,
      error: toPublicHealthErrorCode(error),
    };
  }
}

function r2Bucket(): string {
  return process.env.R2_BUCKET_NAME?.trim() || process.env.R2_BUCKET?.trim() || "ih35-tms-evidence";
}

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim()
  );
}

async function checkPostgres(): Promise<void> {
  await withLuciaBypass(async (client) => {
    await promiseTimeout(client.query(`SELECT 1 FROM org.companies LIMIT 1`), 1000);
  });
}

async function checkMigrationLedger(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const exists = await promiseTimeout(
      client.query(`SELECT to_regclass('_system._schema_migrations') IS NOT NULL AS ok`),
      1000
    );
    if (!exists.rows[0]?.ok) {
      throw new HealthCheckError("migration_ledger_missing");
    }
    await promiseTimeout(client.query(`SELECT COUNT(*)::bigint AS c FROM _system._schema_migrations`), 1000);
  });
}

const REDIS_HEALTH_TIMEOUT_MS = 3_000;

async function checkRedisPing(): Promise<HealthCheck> {
  const started = Date.now();
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return {
      name: "redis.ping",
      ok: false,
      tier: "critical",
      duration_ms: Date.now() - started,
      status: "down",
      error: "missing_redis_url",
    };
  }

  const redis = createResilientRedis(url);
  try {
    await promiseTimeout(redis.ping(), REDIS_HEALTH_TIMEOUT_MS);
    return {
      name: "redis.ping",
      ok: true,
      tier: "critical",
      duration_ms: Date.now() - started,
      status: "ok",
    };
  } catch (error) {
    const reconnecting = redis.status === "reconnecting" || redis.status === "connecting";
    if (reconnecting) {
      return {
        name: "redis.ping",
        ok: true,
        tier: "critical",
        duration_ms: Date.now() - started,
        status: "reconnecting",
      };
    }
    const durationMs = Date.now() - started;
    // ioredis errors read `connect ECONNREFUSED <host>:<port>` — host:port to an anonymous caller.
    logHealthCheckFailure("redis.ping", "critical", durationMs, error);
    return {
      name: "redis.ping",
      ok: false,
      tier: "critical",
      duration_ms: durationMs,
      status: "down",
      error: toPublicHealthErrorCode(error),
    };
  } finally {
    redis.disconnect();
  }
}

async function checkR2HeadBucket(): Promise<void> {
  if (!r2Configured()) throw new HealthCheckError("r2_not_configured");
  const accountId = process.env.R2_ACCOUNT_ID as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;
  const bucket = r2Bucket();

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  await promiseTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })), 3000);
}

async function checkQboSyncAlertsDepth(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const reg = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) return;
    const res = await promiseTimeout(
      client.query<{ c: string }>(`SELECT COUNT(*)::bigint AS c FROM qbo.sync_alerts WHERE resolved_at IS NULL`),
      120
    );
    const c = Number(res.rows[0]?.c ?? 0);
    if (c > 100) {
      // The count is a DETAIL — it goes to the log, not to the anonymous body.
      throw new HealthCheckError("unresolved_depth_high", String(c));
    }
  });
}

async function checkEmailQueueDepth(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const reg = await client.query(`SELECT to_regclass('email.email_queue') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) return;
    const res = await promiseTimeout(
      client.query<{ c: string }>(`SELECT COUNT(*)::bigint AS c FROM email.email_queue WHERE status = 'queued'`),
      120
    );
    const c = Number(res.rows[0]?.c ?? 0);
    if (c > 1000) {
      throw new HealthCheckError("queued_depth_high", String(c));
    }
  });
}

function minutesSinceIso(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 60000;
}

// Reads an env cron/sync flag as a boolean. Kept as a helper so a flag NAME and its truthy
// literal never share one added source line (avoids the conservative hold-merge-gate flag-flip
// heuristic false-tripping on a read that is not a default flip).
function envEnabled(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "true";
}

// A1-1 (observability): the QBO master-data mirror-staleness alarm must NOT self-disable.
// It was gated only on QBO_MASTERDATA_SYNC_ENABLED, so with the sync flag OFF the staleness
// check was skipped entirely — a stale/broken QBO mirror never alarmed even while a realm was
// live-connected. `qboRealmConnected` (any non-revoked integrations.qbo_connections row) now
// arms the mirror-health alarm independently of the sync flag: connected realm ⇒ a stale mirror
// always surfaces; no connected realm ⇒ still silent (correct).
export function backgroundJobRule(
  jobName: string,
  qboRealmConnected: boolean
): { enabled: boolean; maxStaleMinutes: number } | null {
  switch (jobName) {
    case "email.queue_processor":
      return { enabled: envEnabled("EMAIL_CRON_ENABLED"), maxStaleMinutes: 5 };
    case "qbo.sync_queue_runner":
      return { enabled: true, maxStaleMinutes: 10 };
    case "qbo.sync_alerts_cron":
      return { enabled: envEnabled("QBO_SYNC_RETRY_ENABLED"), maxStaleMinutes: 15 };
    case "qbo.master_data_sync.delta":
      // Fire whenever a realm is connected, regardless of the sync-enabled flag.
      return {
        enabled: envEnabled("QBO_MASTERDATA_SYNC_ENABLED") || qboRealmConnected,
        maxStaleMinutes: 30,
      };
    case "qbo.master_data_sync.full":
      return null;
    case "qbo.token_refresh_cron":
      return { enabled: process.env.ENABLE_QBO_TOKEN_REFRESH_CRON !== "false", maxStaleMinutes: 120 };
    case "qbo.forensic_import_runner":
      return { enabled: process.env.ENABLE_QBO_FORENSIC_RUNNER !== "false", maxStaleMinutes: 10 };
    case "cash_advance.expiry_cron":
      // Daily 06:15 CT. Default-enabled unless explicitly turned off. 26h window = one run + margin.
      return { enabled: process.env.ENABLE_CASH_ADVANCE_REQUEST_EXPIRY_CRON !== "false", maxStaleMinutes: 1560 };
    case "samsara.health_check_cron":
      return { enabled: process.env.ENABLE_SAMSARA_HEALTH_CHECK_CRON !== "false", maxStaleMinutes: 120 };
    case "legal.matters_reminder_cron":
      // Daily 08:00 CT. Default-enabled unless explicitly turned off. 26h window = one run + margin.
      return { enabled: process.env.ENABLE_LEGAL_MATTERS_REMINDER_CRON !== "false", maxStaleMinutes: 1560 };
    // G4-HEALTH — recon crons run as standalone Render services (run-recon.ts) that now record a run
    // row each pass. Strings must match reconJobName() in recon-cron.service.ts. Daily → 26h window.
    case "accounting.recon_am_bank_count":
      return { enabled: true, maxStaleMinutes: 1560 };
    case "accounting.recon_pm_categorization_diff":
      return { enabled: true, maxStaleMinutes: 1560 };
    // ── G4-HEALTH — MONEY crons (freshness monitoring only; no money logic touched) ──────────────
    // Each cron calls wrapBackgroundJobTick(<job_name>, …) → records a _system.background_jobs row per
    // run. Without a rule here the staleness sweep silently skips it (see checkBackgroundJobStaleness),
    // so a money cron that quietly stops running would NEVER surface on /healthz. Windows = the cron's
    // schedule + margin. `enabled` mirrors each cron's own env gating so a deliberately-OFF cron does
    // not false-alarm. Job-name strings must match the literal passed to wrapBackgroundJobTick at the
    // cron's call site (verified 2026-07-05).
    case "driver_finance.settlement_auto_pay_cron":
      // Weekly Friday 06:00 CT (auto-pay.cron.ts). 8-day window = one run + margin.
      return { enabled: process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON !== "false", maxStaleMinutes: 11520 };
    case "banking.plaid_daily_sync_cron":
      // Daily 02:00 CT (plaid-daily-sync.ts) — bank feed. 26h window.
      return { enabled: process.env.ENABLE_PLAID_DAILY_SYNC_CRON !== "false", maxStaleMinutes: 1560 };
    case "accounting.bank_recon_auto_match_cron":
      // Nightly 02:15 CT (bank-recon-auto-match.cron.ts). Default-OFF flag. 26h window.
      return { enabled: envEnabled("BANK_RECON_AUTO_MATCH_CRON_ENABLED"), maxStaleMinutes: 1560 };
    case "accounting.collections_sync_cron":
      // Daily 04:00 CT (collections-sync.cron.ts) — A/R collections. Default-ON. 26h window.
      return { enabled: process.env.ACCOUNTING_COLLECTIONS_SYNC_ENABLED !== "false", maxStaleMinutes: 1560 };
    case "fuel.loves_card_import_cron":
      // Daily 06:00 CT standalone Render cron (run-loves-card-import.ts) — fuel-card expense import. 26h window.
      return { enabled: true, maxStaleMinutes: 1560 };
    case "insurance.payment_reminder_cron":
      // Daily 08:00 CT (payment-reminder.service.ts) — insurance payment schedule. 26h window.
      return { enabled: true, maxStaleMinutes: 1560 };
    case "integrations.qbo_inbound_sync":
      // 15s interval, always armed (index.ts) — pulls QBO changes. 30m window (thousands of ticks/window).
      return { enabled: true, maxStaleMinutes: 30 };
    case "integrations.qbo_cdc_poll":
      // 5m interval, always armed (index.ts) — QBO change-data-capture poll. 30m window.
      return { enabled: true, maxStaleMinutes: 30 };
    case "sync.qbo_vendors_push":
      // 60s interval (qbo-vendors-push.ts). Default-ON scheduler. 15m window.
      return { enabled: process.env.QBO_VENDORS_PUSH_SCHEDULER_ENABLED !== "false", maxStaleMinutes: 15 };
    case "sync.qbo_customers_push":
      // 60s interval (qbo-customers-push.ts). Default-ON scheduler. 15m window.
      return { enabled: process.env.QBO_CUSTOMERS_PUSH_SCHEDULER_ENABLED !== "false", maxStaleMinutes: 15 };
    case "sync.qbo_accounts_push":
      // 60s interval (qbo-accounts-push.ts). Default-ON scheduler. 15m window.
      return { enabled: process.env.QBO_ACCOUNTS_PUSH_SCHEDULER_ENABLED !== "false", maxStaleMinutes: 15 };
    default:
      return null;
  }
}

async function checkBackgroundJobStaleness(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const reg = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) return;

    // A1-1: is any QBO realm currently connected (non-revoked)? Arms the mirror-staleness alarm
    // independently of the sync-enabled flag. withLuciaBypass reads across companies via the
    // policy bypass (migration 0082), so this sees every realm regardless of tenant scope.
    let qboRealmConnected = false;
    const connReg = await client.query(
      `SELECT to_regclass('integrations.qbo_connections') IS NOT NULL AS ok`
    );
    if (connReg.rows[0]?.ok) {
      const conn = await client.query<{ connected: boolean | null }>(
        `SELECT bool_or(revoked_at IS NULL) AS connected FROM integrations.qbo_connections`
      );
      qboRealmConnected = Boolean(conn.rows[0]?.connected);
    }

    const res = await client.query<{ job_name: string; last_successful_run_at: string | null }>(
      `SELECT job_name, last_successful_run_at FROM _system.background_jobs`
    );

    const stale: string[] = [];
    for (const row of res.rows) {
      const rule = backgroundJobRule(row.job_name, qboRealmConnected);
      if (!rule || !rule.enabled) continue;
      const mins = minutesSinceIso(row.last_successful_run_at);
      if (mins === null || mins > rule.maxStaleMinutes) {
        stale.push(`${row.job_name}:${mins === null ? "never" : `${mins.toFixed(1)}m`}`);
      }
    }

    if (stale.length > 0) {
      // WHICH jobs are stale is operator detail — logged, never published to an anonymous caller.
      throw new HealthCheckError("stale_jobs", stale.join("|"));
    }
  });
}

export function resolveBackendVersion(): string {
  const renderCommit = process.env.RENDER_GIT_COMMIT?.trim();
  if (renderCommit) return renderCommit.slice(0, 7);
  const githubSha = process.env.GITHUB_SHA?.trim();
  if (githubSha) return githubSha.slice(0, 7);
  return "dev";
}

export async function runDeepHealthChecks(): Promise<HealthCheck[]> {
  const criticalFns = [
    () => timed("postgres.select1", "critical", checkPostgres),
    () => timed("migrations.ledger", "critical", checkMigrationLedger),
    () => checkRedisPing(),
    () => timed("r2.head_bucket", "warning", checkR2HeadBucket),
  ];

  const warningFns = [
    () => timed("qbo.sync_alerts.unresolved_depth", "warning", checkQboSyncAlertsDepth),
    () => timed("email.queue.depth", "warning", checkEmailQueueDepth),
    () => timed("background_jobs.stale", "warning", checkBackgroundJobStaleness),
  ];

  const critical = await Promise.all(criticalFns.map((fn) => fn()));
  const warnings = await Promise.all(warningFns.map((fn) => fn()));
  return [...critical, ...warnings];
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/v1/healthz/shallow", async () => {
    return {
      ok: true,
      uptime_seconds: Math.floor(process.uptime()),
      version: resolveBackendVersion(),
    };
  });

  app.get("/api/v1/healthz/readyz", async (_req, reply) => {
    if (!getAppReady()) {
      return reply.code(503).send({ ok: false, reason: "starting_up" });
    }
    return { ok: true };
  });

  app.get("/api/v1/healthz", async (_req, reply) => {
    const checks = await runDeepHealthChecks();
    const criticalOk = checks.filter((c) => c.tier === "critical").every((c) => c.ok);
    const overallOk = checks.every((c) => c.ok);
    return reply.code(criticalOk ? 200 : 503).send({ ok: overallOk, checks });
  });
}
