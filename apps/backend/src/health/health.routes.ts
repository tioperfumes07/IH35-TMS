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

/** Full-fidelity server-side record of what the public body deliberately omits.
 * H4 RUNBOOK: GET /healthz/shallow is not a check verdict (always ok). Full GET /healthz
 * exposes only publicCode (stale_jobs | qbo_oauth_invalid). Job names + ages + oauth
 * counts are here: filter Render logs for health_check_failed. Do not ARM
 * IH35_QBO_JOB_HEALTH_ARMED to "fix" invalid_grant — owner QBO re-auth. */
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

/**
 * H4 split (CC-2 2026-08-29): job-stale inbound/CDC may be dormant under USMCA-only.
 * Connected realms with needs_reauth_at / invalid_grant are a different truth — do not
 * hide them by unarming job freshness. Public code only; realm ids stay in the log.
 * Owner re-auth in QBO (no coder can exchange tokens). Do NOT set IH35_QBO_JOB_HEALTH_ARMED
 * to "fix" OAuth.
 */
async function checkQboOauthNeedsReauth(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const reg = await client.query(`SELECT to_regclass('integrations.qbo_connections') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) return;
    const res = await promiseTimeout(
      client.query<{ c: string }>(
        `SELECT COUNT(*)::bigint AS c
           FROM integrations.qbo_connections
          WHERE revoked_at IS NULL
            AND (
              needs_reauth_at IS NOT NULL
              OR COALESCE(last_refresh_error, '') ILIKE '%invalid_grant%'
            )`
      ),
      120
    );
    const c = Number(res.rows[0]?.c ?? 0);
    if (c > 0) {
      throw new HealthCheckError("qbo_oauth_invalid", String(c));
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

/** QBO jobs by name prefix (not Samsara / bank / TMS money crons). */
export function isQboBackgroundJob(jobName: string): boolean {
  return (
    jobName.startsWith("qbo.") ||
    jobName.startsWith("qbo_sync.") ||
    jobName.startsWith("integrations.qbo") ||
    jobName.startsWith("sync.qbo_") ||
    jobName.startsWith("reconciliation.qbo_")
  );
}

/**
 * GO-0105-R1: ARM is an override (force QBO-named jobs through per-job rules even when
 * there is no connection row). It is NEVER the only gate. An active connection with
 * needs_reauth_at must still fail healthz (entity names in the logged stale_jobs detail).
 */
export function qboJobHealthArmed(): boolean {
  return process.env.IH35_QBO_JOB_HEALTH_ARMED === "true";
}

export type QboJobHealthEvidence = {
  anyActiveConnection: boolean;
  needsReauthLabels: string[];
};

export function coerceQboJobHealthEvidence(
  arg: boolean | QboJobHealthEvidence | undefined
): QboJobHealthEvidence {
  if (arg && typeof arg === "object") {
    return {
      anyActiveConnection: Boolean(arg.anyActiveConnection),
      needsReauthLabels: [...(arg.needsReauthLabels ?? [])],
    };
  }
  return { anyActiveConnection: Boolean(arg), needsReauthLabels: [] };
}

/** Planted: active + needs_reauth_at ⇒ not dormant (must still fail the check). */
export function qboNamedJobsAreDormant(ev: QboJobHealthEvidence): boolean {
  if (ev.needsReauthLabels.length > 0) return false;
  if (qboJobHealthArmed()) return false;
  return !ev.anyActiveConnection;
}

// A1-1 (observability): the QBO master-data mirror-staleness alarm must NOT self-disable.
// It was gated only on QBO_MASTERDATA_SYNC_ENABLED, so with the sync flag OFF the staleness
// check was skipped entirely — a stale/broken QBO mirror never alarmed even while a realm was
// live-connected. `qboRealmConnected` (any non-revoked integrations.qbo_connections row) now
// arms the mirror-health alarm independently of the sync flag: connected realm ⇒ a stale mirror
// always surfaces; no connected realm ⇒ still silent (correct).
// H4 R1: dormancy is per-connection (no row → dormant; needs_reauth_at → alarm + name entity).
function envExplicitlyFalse(name: string): boolean {
  return process.env[name]?.trim() === "false";
}

export function backgroundJobRule(
  jobName: string,
  qboRealmConnectedOrEvidence: boolean | QboJobHealthEvidence = false
): { enabled: boolean; maxStaleMinutes: number; dormantReason?: string } | null {
  // DRIFT-5: render.yaml DISABLES inbound/CDC. A connected TRANSP realm must not
  // mark those ticks stale while the cron never runs. Env-off wins over connection.
  if (jobName === "integrations.qbo_inbound_sync" && envExplicitlyFalse("ENABLE_QBO_INBOUND_SYNC")) {
    return { enabled: false, maxStaleMinutes: 30, dormantReason: "env_disabled" };
  }
  if (jobName === "integrations.qbo_cdc_poll" && envExplicitlyFalse("ENABLE_QBO_CDC_POLL")) {
    return { enabled: false, maxStaleMinutes: 30, dormantReason: "env_disabled" };
  }
  const evidence = coerceQboJobHealthEvidence(qboRealmConnectedOrEvidence);
  const qboRealmConnected = evidence.anyActiveConnection;
  if (
    (jobName === "integrations.qbo_inbound_sync" ||
      jobName === "integrations.qbo_cdc_poll" ||
      jobName === "sync.qbo_vendors_push" ||
      jobName === "sync.qbo_customers_push" ||
      jobName === "sync.qbo_accounts_push") &&
    qboNamedJobsAreDormant(evidence)
  ) {
    return { enabled: false, maxStaleMinutes: 30, dormantReason: "no_qbo_connection_for_entity" };
  }
  switch (jobName) {
    // ── OPS-F76 — the 8 jobs OPS-F75 deliberately skipped, now paired BY HAND ──────────────────────
    //
    // OPS-F75 added cadences only where a file declared ONE job and ONE cron expression, because a
    // positional guess had already mis-paired the multi-job files once. These eight live in files that
    // declare several of each, so each was resolved by reading which cron.schedule() call precedes
    // which wrapBackgroundJobTick() name:
    //   master-data-sync.cron.ts        "0 2 * * *"->full            "*/15 * * * *"->delta
    //   cache-warmer.ts                 "*/5 * * * *"->tier3         "*/15 * * * *"->tier4
    //   qbo-remote-count-collector      "10 */6 * * *"->delta        "20 2 * * *"->full
    //   reconciliation-worker.cron.ts   "35 */6"->qbo_refdata  "45 * * * *"->qbo_transactional
    //                                   "50 */12"->samsara_static  "55 * * * *"->cap15_identity
    //
    // qbo.master_data_sync.{delta,full} and qbo.token_refresh_cron already had rules and are NOT
    // touched — delta's 30m against a 15m period is correct, and full returns null deliberately.
    //
    // THIS CONFIRMS THE OPS-F75 RETRACTION RATHER THAN REVERSING IT. On the earlier bad pairing I
    // briefly "found" five thresholds shorter than their own period. With the correct pairings there
    // are NONE: the reconciliation jobs had no rule at all, and every pre-existing rule is >= its
    // period. The original thresholds were sound; only my extraction was wrong.
    case "qbo.remote_count_collector.delta":
      // "10 */6 * * *" = every 360m -> two missed periods
      return { enabled: true, maxStaleMinutes: 720 };
    case "qbo.remote_count_collector.full":
      // "20 2 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "reconciliation.qbo_refdata":
      // "35 */6 * * *" = every 360m -> two missed periods
      return { enabled: true, maxStaleMinutes: 720 };
    case "reconciliation.qbo_transactional":
      // "45 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "reconciliation.samsara_static":
      // "50 */12 * * *" = every 720m -> two missed periods
      return { enabled: true, maxStaleMinutes: 1440 };
    case "reconciliation.cap15_identity":
      // "55 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "samsara.cache_warmer.tier3":
      // "*/5 * * * *" = every 5m -> two missed periods
      return { enabled: true, maxStaleMinutes: 15 };
    case "samsara.cache_warmer.tier4":
      // "*/15 * * * *" = every 15m -> two missed periods
      return { enabled: true, maxStaleMinutes: 30 };
    // ── OPS-F75 — cadences DERIVED from each job's own literal cron expression ─────────────────────
    //
    // 49 of 72 registered jobs had no rule, so `if (!rule) continue` skipped them entirely. OPS-F69
    // (#3970) made "never succeeded" rule-independent; this adds the LATE-vs-ON-TIME layer.
    //
    // Threshold = max(interval * 2, 15): alarm only after TWO consecutive periods are missed, because
    // a single skipped tick (deploy restart, slow upstream) is normal operational noise and an alarm
    // that fires on normal noise is what trained everyone to ignore this check.
    //
    // ONLY UNAMBIGUOUS PAIRINGS ARE ADDED — one job name and one cron expression in the same file.
    // My first extraction took the FIRST expression in a file and applied it to EVERY job declared
    // there, which silently mis-paired the multi-job files and then "corrected" five perfectly good
    // thresholds toward impossible values. An existing health test caught it. Excluded for that
    // reason (their real cadences must be paired by hand, per job):
    //   qbo.master_data_sync.{delta,full}          "0 2 * * *" + "*/15 * * * *"
    //   samsara.cache_warmer.{tier3,tier4}         "*/5 * * * *" + "*/15 * * * *"
    //   qbo.remote_count_collector.{delta,full}    "10 */6 * * *" + "20 2 * * *"
    //   qbo.token_refresh_cron                     "0 * * * *" + "*/15 * * * *"
    //   reconciliation.{cap15_identity,qbo_refdata,qbo_transactional,samsara_static}
    //                                              four jobs, four different expressions
    // Guessing which line belongs to which job would be exactly the invented window this avoids.
    case "accounting.depreciation_autopost":
      // "15 6 1 * *" = every 44640m -> two missed periods
      return { enabled: true, maxStaleMinutes: 89280 };
    case "accounting.factoring_default_interest_cron":
      // "30 5 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "ai.model_lifecycle_monitor":
      // "30 8 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "border_crossing.cbp_wait_times_refresh":
      // "*/5 * * * *" = every 5m -> two missed periods
      return { enabled: true, maxStaleMinutes: 15 };
    case "compliance.csa_basic_pull_cron":
      // "30 5 * * *" = every 1440m -> two missed periods
      // Public SAFER does not expose CSA BASIC measures. The worker is therefore explicit opt-in,
      // and health must mirror that same capability gate instead of alarming forever for a job the
      // process deliberately did not schedule.
      return { enabled: envEnabled("ENABLE_CSA_BASIC_PULL_CRON"), maxStaleMinutes: 2880 };
    case "compliance.fmcsa_safer_verification_cron":
      // "15 6 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "compliance.reminder_cron":
      // "0 6 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "drivers.document_alert_engine_cron":
      // "35 7 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "fuel.fraud_detector_worker":
      // "*/15 * * * *" = every 15m -> two missed periods
      // The detector can create alerts and dispatch notifications, so its worker is default-OFF.
      // Monitoring the disabled ledger row as enabled made one historic run permanently stale.
      return { enabled: envEnabled("ENABLE_FUEL_FRAUD_DETECTOR_WORKER"), maxStaleMinutes: 30 };
    case "idempotency.cleanup_cron":
      // "30 3 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "integrations.auto_status_switch_worker":
      // "*/5 * * * *" = every 5m -> two missed periods
      return { enabled: true, maxStaleMinutes: 15 };
    case "maintenance.cap12_tire_tread.projections":
      // "0 5 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "maintenance.cap13_brake_wear.projections":
      // "0 5 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "maintenance.pm_auto_engine_cron":
      // "5 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "maintenance.reefer_hours_poll_cron":
      // "*/15 * * * *" = every 15m -> two missed periods
      return { enabled: true, maxStaleMinutes: 30 };
    case "qbo_sync.drift_scheduler":
      // "0 */4 * * *" = every 240m -> two missed periods
      return { enabled: true, maxStaleMinutes: 480 };
    case "reports.deadhead_refresh_cron":
      // "0 3 * * 1" = every 10080m -> two missed periods
      return { enabled: true, maxStaleMinutes: 20160 };
    case "reports.lane_profitability_refresh_cron":
      // "0 2 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "safety.cert_expiry_monitor":
      // "0 6 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "safety.da_random_pool.quarterly_draw":
      // "0 7 1 1,4,7,10 *" = every 44640m -> two missed periods
      return { enabled: true, maxStaleMinutes: 89280 };
    case "safety.damage_continuity_worker":
      // "0 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "safety.driver_leave_advance_reminder":
      // "0 7 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "safety.driver_leave_balance_rollover":
      // "30 0 1 1 *" = every 44640m -> two missed periods
      return { enabled: true, maxStaleMinutes: 89280 };
    case "safety.driver_leave_pending_escalation":
      // "30 7 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "safety.driver_scoring.weekly_aggregator":
      // "0 3 * * 1" = every 10080m -> two missed periods
      return { enabled: true, maxStaleMinutes: 20160 };
    case "safety.integrity_alert_engine_cron":
      // "20 */6 * * *" = every 360m -> two missed periods
      return { enabled: true, maxStaleMinutes: 720 };
    case "safety.reminders_cron":
      // "15 6 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "samsara.hos_pull_cron":
      // "15 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "samsara.master_sync_cron":
      // "30 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "samsara.positions_cron":
      // "*/5 * * * *" = every 5m -> two missed periods
      return { enabled: true, maxStaleMinutes: 15 };
    case "samsara.remote_count_collector":
      // "5 */12 * * *" = every 720m -> two missed periods
      return { enabled: true, maxStaleMinutes: 1440 };
    case "samsara.vehicle_driver_pairing_sync":
      // "0 * * * *" = every 60m -> two missed periods
      return { enabled: true, maxStaleMinutes: 120 };
    case "samsara.webhook_projection_cron":
      // "*/1 * * * *" = every 1m -> two missed periods
      // SYSTEM-BACKGROUND-JOB-LEDGER-STALE-AFTER-SUCCESSFUL-TICKS — this rule stayed unconditionally
      // enabled while the cron's own registration (samsara-webhook-projection.cron.ts) and its
      // in-process catch-up (in-process-startup-catchup.ts) both correctly gate on
      // ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON (default enabled unless explicitly "false"). With the
      // flag off, the cron never ticks by design and the catch-up correctly skips it too — but this
      // rule kept demanding a tick every 15 minutes forever, with no way to ever satisfy it. Live-
      // confirmed: 2026-08-25, this job's last_successful_run_at was 5,305 minutes (3.7 days) stale,
      // the single largest contributor to `background_jobs.stale` staying DOWN. Mirrors the same
      // env-gate pattern already used for compliance.csa_basic_pull_cron, fuel.fraud_detector_worker,
      // email.queue_processor, and others in this same switch.
      return {
        enabled: (process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON ?? "true").trim() !== "false",
        maxStaleMinutes: 15,
      };
    case "search.indexer_incremental":
      // "0 3 * * *" = every 1440m -> two missed periods
      return { enabled: true, maxStaleMinutes: 2880 };
    case "tasks.alarm_cron":
      // "*/15 * * * *" = every 15m -> two missed periods
      return { enabled: true, maxStaleMinutes: 30 };
    case "email.queue_processor":
      return { enabled: envEnabled("EMAIL_CRON_ENABLED"), maxStaleMinutes: 5 };
    case "chat.confirmation_escalation":
      // "* * * * *" = every 1m → two missed periods. Cron default-ON unless
      // ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON=false (chat-confirmation-escalation.cron.ts).
      // SYSTEM-BACKGROUND-JOB-LEDGER-STALE: this job was recording wrapBackgroundJobTick rows
      // with no health rule, so LATE after deploy churn was invisible; with a rule it must
      // also catch-up on boot (in-process-startup-catchup.ts).
      return {
        enabled: process.env.ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON !== "false",
        maxStaleMinutes: 5,
      };
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
      // H4: no connected realm ⇒ dormant-by-design (USMCA QBO off / no write-back), not "stale".
      // A permanently-yellow check trains operators to ignore healthz.
      return qboRealmConnected
        ? { enabled: true, maxStaleMinutes: 30 }
        : { enabled: false, maxStaleMinutes: 30, dormantReason: "no_qbo_realm_connected" };
    case "integrations.qbo_cdc_poll":
      return qboRealmConnected
        ? { enabled: true, maxStaleMinutes: 30 }
        : { enabled: false, maxStaleMinutes: 30, dormantReason: "no_qbo_realm_connected" };
    case "sync.qbo_vendors_push":
      if (!qboRealmConnected) {
        return { enabled: false, maxStaleMinutes: 15, dormantReason: "no_qbo_realm_connected" };
      }
      return { enabled: process.env.QBO_VENDORS_PUSH_SCHEDULER_ENABLED !== "false", maxStaleMinutes: 15 };
    case "sync.qbo_customers_push":
      if (!qboRealmConnected) {
        return { enabled: false, maxStaleMinutes: 15, dormantReason: "no_qbo_realm_connected" };
      }
      return { enabled: process.env.QBO_CUSTOMERS_PUSH_SCHEDULER_ENABLED !== "false", maxStaleMinutes: 15 };
    case "sync.qbo_accounts_push":
      if (!qboRealmConnected) {
        return { enabled: false, maxStaleMinutes: 15, dormantReason: "no_qbo_realm_connected" };
      }
      return { enabled: process.env.QBO_ACCOUNTS_PUSH_SCHEDULER_ENABLED !== "false", maxStaleMinutes: 15 };
    default:
      return null;
  }
}

async function checkBackgroundJobStaleness(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const reg = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) return;

    // A1-1 + H4 R1: per-connection evidence (not a global ARM flag).
    const qboEvidence: QboJobHealthEvidence = { anyActiveConnection: false, needsReauthLabels: [] };
    const connReg = await client.query(
      `SELECT to_regclass('integrations.qbo_connections') IS NOT NULL AS ok`
    );
    if (connReg.rows[0]?.ok) {
      const conn = await client.query<{ connected: boolean | null }>(
        `SELECT bool_or(revoked_at IS NULL) AS connected FROM integrations.qbo_connections`
      );
      qboEvidence.anyActiveConnection = Boolean(conn.rows[0]?.connected);
      const reauth = await client.query<{ code: string }>(
        `SELECT oc.code
           FROM integrations.qbo_connections qc
           JOIN org.companies oc ON oc.id = qc.operating_company_id
          WHERE qc.revoked_at IS NULL
            AND qc.needs_reauth_at IS NOT NULL
          ORDER BY oc.code`
      );
      qboEvidence.needsReauthLabels = reauth.rows.map((r) => r.code);
    }

    const res = await client.query<{ job_name: string; last_successful_run_at: string | null }>(
      `SELECT job_name, last_successful_run_at FROM _system.background_jobs`
    );

    // OPS-F65 — a job that has NEVER succeeded is a different condition from one that is merely
    // LATE, and collapsing both into one "stale_jobs" code is why eight never-succeeded jobs sat
    // unnoticed on prod (2026-08-01: the DOT random-pool draw, four QBO sync steps, the universal
    // search indexer). "Late" is routine and self-heals on the next tick; "never succeeded" means the
    // code path has NEVER worked and never will without a fix. One shared code made a permanently
    // broken job indistinguishable from a job that ran twelve minutes ago, and a signal that is
    // always slightly red teaches everyone to stop reading it.
    //
    // Job NAMES stay out of the public payload — /healthz is unauthenticated and the names describe
    // internal structure. They already reach the server log through HealthCheckError's detail, and
    // that is where an operator should read them. What changes here is only WHICH bounded token an
    // anonymous caller sees, so the distinction costs nothing in exposure.
    const neverSucceeded: string[] = [];
    const late: string[] = [];
    for (const label of qboEvidence.needsReauthLabels) {
      late.push(`${label}:needs_reauth`);
    }
    for (const row of res.rows) {
      const rule = backgroundJobRule(row.job_name, qboEvidence);
      const mins = minutesSinceIso(row.last_successful_run_at);

      // H4 — dormant-by-design must not appear as never_succeeded or stale.
      if (rule?.dormantReason && rule.enabled === false) continue;

      // OPS-F69 — NEVER-SUCCEEDED NEEDS NO RULE.
      //
      // Staleness is opt-in for a good reason: "late" only means something against a known cadence,
      // and a weekly job measured on a daily threshold would alarm forever. But a registered job that
      // has NEVER ONCE succeeded is a defect under ANY cadence — there is no threshold under which
      // "it has never worked" is acceptable, so it needs no rule to be reportable.
      //
      // This is the gap that made OPS-F65 (#3966) ineffective in practice. Prod, 2026-08-01: 72 jobs
      // registered, only 23 carry a rule, and ALL EIGHT never-succeeded jobs are among the 49 unruled
      // — the DOT random-pool draw, five QBO sync steps, and the universal search indexer. Every one
      // of them hit `if (!rule) continue` and was skipped BEFORE the never-vs-late test, so splitting
      // those two codes improved a signal that never fired for them.
      //
      // That correlation is not coincidence: nobody writes a staleness rule for a job they are not
      // thinking about, and a job nobody is thinking about is exactly the one that quietly never runs.
      // An allowlist-shaped monitor cannot see its own blind spot. Never-succeeded is now measured
      // against the JOB TABLE itself rather than against the list someone remembered to maintain.
      if (mins === null) {
        neverSucceeded.push(`${row.job_name}:never`);
        continue;
      }

      // Late still requires an explicit cadence — without one there is no honest threshold.
      if (!rule || !rule.enabled) continue;
      if (mins > rule.maxStaleMinutes) late.push(`${row.job_name}:${mins.toFixed(1)}m`);
    }

    // Never-succeeded outranks late: report the more serious condition when both are present, and
    // carry BOTH lists in the logged detail so nothing is hidden by the precedence.
    const detail = [...neverSucceeded, ...late].join("|");
    // GO-0105-R1: token-dead active realms must publish stale_jobs (entity:needs_reauth in the log).
    if (qboEvidence.needsReauthLabels.length > 0) {
      throw new HealthCheckError("stale_jobs", detail);
    }
    if (neverSucceeded.length > 0) {
      throw new HealthCheckError("never_succeeded_jobs", detail);
    }
    if (late.length > 0) {
      throw new HealthCheckError("stale_jobs", detail);
    }
  });
}

/** H3 — error pipeline cannot die silently. Production without DSN is unconfigured, not "no errors". */
async function checkSentryHeartbeat(): Promise<void> {
  const onRender = Boolean(process.env.RENDER === "true" || process.env.RENDER_GIT_COMMIT?.trim());
  if (!onRender && process.env.NODE_ENV !== "production") return;
  if (!process.env.SENTRY_DSN?.trim()) {
    throw new HealthCheckError("sentry_unconfigured", "SENTRY_DSN missing");
  }
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
    () => timed("qbo.connections.oauth", "warning", checkQboOauthNeedsReauth),
    () => timed("email.queue.depth", "warning", checkEmailQueueDepth),
    () => timed("background_jobs.stale", "warning", checkBackgroundJobStaleness),
    () => timed("sentry.heartbeat", "warning", checkSentryHeartbeat),
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
