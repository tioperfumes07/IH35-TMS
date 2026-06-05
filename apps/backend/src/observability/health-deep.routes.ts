/**
 * CLOSURE-21 — Deep health check at /api/v1/health/deep.
 *
 * Returns 200 only when every critical dependency is reachable:
 *   - Postgres  : `SELECT 1 FROM org.companies LIMIT 1` succeeds
 *   - QuickBooks: a connected token synced within the last hour
 *   - Samsara   : a noop API call returns 2xx
 *   - Plaid     : a connected item synced within the last 24 hours
 *
 * Returns 503 with the list of failed checks when any critical dependency is
 * down. This module is additive — register it from the app bootstrap with
 * `registerDeepHealthRoutes(app)`.
 */

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { logger } from "./structured-logger.js";

export type DependencyStatus = "ok" | "degraded" | "down" | "skipped";

export interface DependencyCheckResult {
  name: string;
  status: DependencyStatus;
  critical: boolean;
  duration_ms: number;
  detail?: string;
}

const QBO_MAX_SYNC_AGE_MS = 60 * 60 * 1000; // 1h
const PLAID_MAX_SYNC_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const SAMSARA_TIMEOUT_MS = 3000;

async function withTiming(
  name: string,
  critical: boolean,
  run: () => Promise<{ status: DependencyStatus; detail?: string }>
): Promise<DependencyCheckResult> {
  const started = Date.now();
  try {
    const { status, detail } = await run();
    return { name, status, critical, duration_ms: Date.now() - started, detail };
  } catch (error) {
    return {
      name,
      status: "down",
      critical,
      duration_ms: Date.now() - started,
      detail: String((error as Error)?.message ?? error),
    };
  }
}

async function checkDatabase(): Promise<{ status: DependencyStatus; detail?: string }> {
  await withLuciaBypass(async (client) => {
    await client.query("SELECT 1 FROM org.companies LIMIT 1");
  });
  return { status: "ok" };
}

async function regclassExists(
  client: { query: <T>(sql: string) => Promise<{ rows: T[] }> },
  qualified: string
): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('${qualified}') IS NOT NULL AS ok`
  );
  return Boolean(res.rows[0]?.ok);
}

async function checkQuickBooks(): Promise<{ status: DependencyStatus; detail?: string }> {
  return await withLuciaBypass(async (client) => {
    if (!(await regclassExists(client, "qbo.connections"))) {
      return { status: "skipped" as const, detail: "qbo.connections not present" };
    }
    const res = await client.query<{ last_sync_at: string | null; status: string | null }>(
      `SELECT last_sync_at, status
         FROM qbo.connections
        WHERE status = 'connected'
        ORDER BY last_sync_at DESC NULLS LAST
        LIMIT 1`
    );
    const row = res.rows[0];
    if (!row) return { status: "down" as const, detail: "no connected qbo connection" };
    const ageMs = row.last_sync_at ? Date.now() - Date.parse(row.last_sync_at) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(ageMs) || ageMs > QBO_MAX_SYNC_AGE_MS) {
      return { status: "degraded" as const, detail: `last sync ${row.last_sync_at ?? "never"}` };
    }
    return { status: "ok" as const };
  });
}

async function checkSamsara(): Promise<{ status: DependencyStatus; detail?: string }> {
  const token = process.env.SAMSARA_API_TOKEN?.trim();
  if (!token) return { status: "skipped", detail: "SAMSARA_API_TOKEN not set" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAMSARA_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.samsara.com/fleet/vehicles?limit=1", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return { status: "down", detail: `samsara http ${res.status}` };
    return { status: "ok" };
  } finally {
    clearTimeout(timer);
  }
}

async function checkPlaid(): Promise<{ status: DependencyStatus; detail?: string }> {
  return await withLuciaBypass(async (client) => {
    if (!(await regclassExists(client, "banking.plaid_items"))) {
      return { status: "skipped" as const, detail: "banking.plaid_items not present" };
    }
    const res = await client.query<{ last_sync_at: string | null }>(
      `SELECT last_sync_at
         FROM banking.plaid_items
        WHERE status = 'connected'
        ORDER BY last_sync_at DESC NULLS LAST
        LIMIT 1`
    );
    const row = res.rows[0];
    if (!row) return { status: "down" as const, detail: "no connected plaid item" };
    const ageMs = row.last_sync_at ? Date.now() - Date.parse(row.last_sync_at) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(ageMs) || ageMs > PLAID_MAX_SYNC_AGE_MS) {
      return { status: "degraded" as const, detail: `last sync ${row.last_sync_at ?? "never"}` };
    }
    return { status: "ok" as const };
  });
}

export async function runDeepDependencyChecks(): Promise<DependencyCheckResult[]> {
  return await Promise.all([
    withTiming("postgres", true, checkDatabase),
    withTiming("quickbooks", true, checkQuickBooks),
    withTiming("samsara", true, checkSamsara),
    withTiming("plaid", true, checkPlaid),
  ]);
}

/** A skipped (unconfigured) dependency does not fail the deep check. */
function isFailing(check: DependencyCheckResult): boolean {
  return check.critical && (check.status === "down" || check.status === "degraded");
}

export function registerDeepHealthRoutes(app: FastifyInstance): void {
  app.get("/api/v1/health/deep", async (_req, reply) => {
    const checks = await runDeepDependencyChecks();
    const failed = checks.filter(isFailing);
    const ok = failed.length === 0;

    if (!ok) {
      logger.warn("health.deep.degraded", {
        failed: failed.map((c) => `${c.name}:${c.status}`).join(","),
      });
    }

    return reply.code(ok ? 200 : 503).send({
      ok,
      checked_at: new Date().toISOString(),
      failed: failed.map((c) => c.name),
      checks,
    });
  });
}
