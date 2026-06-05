import type { FastifyInstance } from "fastify";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { withLuciaBypass } from "../auth/db.js";
import { getAppReady } from "../lib/startup-ready.js";
import { createResilientRedis, type RedisHealthStatus } from "../lib/redis.client.js";

export type HealthCheck = {
  name: string;
  ok: boolean;
  tier: "critical" | "warning";
  duration_ms: number;
  error?: string;
  status?: RedisHealthStatus;
};

async function promiseTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms);
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
    return {
      name,
      ok: false,
      tier,
      duration_ms: Date.now() - started,
      error: String((error as Error)?.message ?? error),
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
      throw new Error("migration_ledger_missing");
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
    return {
      name: "redis.ping",
      ok: false,
      tier: "critical",
      duration_ms: Date.now() - started,
      status: "down",
      error: String((error as Error)?.message ?? error),
    };
  } finally {
    redis.disconnect();
  }
}

async function checkR2HeadBucket(): Promise<void> {
  if (!r2Configured()) throw new Error("r2_not_configured");
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
      throw new Error(`unresolved_depth_high:${c}`);
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
      throw new Error(`queued_depth_high:${c}`);
    }
  });
}

function minutesSinceIso(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 60000;
}

function backgroundJobRule(jobName: string): { enabled: boolean; maxStaleMinutes: number } | null {
  switch (jobName) {
    case "email.queue_processor":
      return { enabled: process.env.EMAIL_CRON_ENABLED === "true", maxStaleMinutes: 5 };
    case "qbo.sync_queue_runner":
      return { enabled: true, maxStaleMinutes: 10 };
    case "qbo.sync_alerts_cron":
      return { enabled: process.env.QBO_SYNC_RETRY_ENABLED === "true", maxStaleMinutes: 15 };
    case "qbo.master_data_sync.delta":
      return { enabled: process.env.QBO_MASTERDATA_SYNC_ENABLED === "true", maxStaleMinutes: 30 };
    case "qbo.master_data_sync.full":
      return null;
    case "qbo.token_refresh_cron":
      return { enabled: process.env.ENABLE_QBO_TOKEN_REFRESH_CRON !== "false", maxStaleMinutes: 120 };
    case "qbo.forensic_import_runner":
      return { enabled: process.env.ENABLE_QBO_FORENSIC_RUNNER !== "false", maxStaleMinutes: 10 };
    case "cash_advance.expiry_cron":
      return null;
    case "samsara.health_check_cron":
      return { enabled: process.env.ENABLE_SAMSARA_HEALTH_CHECK_CRON !== "false", maxStaleMinutes: 120 };
    case "legal.matters_reminder_cron":
      return null;
    default:
      return null;
  }
}

async function checkBackgroundJobStaleness(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const reg = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) return;

    const res = await client.query<{ job_name: string; last_successful_run_at: string | null }>(
      `SELECT job_name, last_successful_run_at FROM _system.background_jobs`
    );

    const stale: string[] = [];
    for (const row of res.rows) {
      const rule = backgroundJobRule(row.job_name);
      if (!rule || !rule.enabled) continue;
      const mins = minutesSinceIso(row.last_successful_run_at);
      if (mins === null || mins > rule.maxStaleMinutes) {
        stale.push(`${row.job_name}:${mins === null ? "never" : `${mins.toFixed(1)}m`}`);
      }
    }

    if (stale.length > 0) {
      throw new Error(`stale_jobs:${stale.join("|")}`);
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
