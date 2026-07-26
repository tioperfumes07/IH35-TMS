/**
 * ARCHIVED 2026-07-25 — SECURITY. This module no longer registers an HTTP route.
 * ============================================================================
 * It previously registered an UNAUTHENTICATED `GET /api/v1/health/deep`. The handler ran under
 * `withLuciaBypass` (RLS bypassed) with no `requireAuth` and no role gate, and the response body
 * disclosed, to any anonymous caller:
 *
 *   - which third-party integrations this carrier uses (quickbooks / samsara / plaid, by name)
 *   - per-integration connection state (ok | degraded | down | skipped)
 *   - the QuickBooks and Plaid LAST-SYNC TIMESTAMPS, verbatim, in `detail`
 *   - whether a Samsara API token is configured, and Samsara's upstream HTTP status (e.g. 401 =
 *     the carrier's token is revoked) in `detail`
 *   - raw driver/database error strings via `withTiming`'s catch, which returns
 *     `String(error.message)` straight to the caller
 *   - per-dependency `duration_ms` (a timing oracle) and whether `qbo.connections` /
 *     `banking.plaid_items` exist in the schema
 *
 * It was never mounted (the C10 route-parity sweep refused it), but "unmounted" is not "safe": the
 * registrar was one import away from publishing all of the above on the public internet, and
 * scripts/uptime-monitor-config.mjs still defines an EXTERNAL uptime monitor pointing at
 * `/api/v1/health/deep` — i.e. there was standing pressure to mount it to make that monitor green.
 *
 * WHY ARCHIVED RATHER THAN AUTHENTICATED: it is a dead duplicate.
 *   - `GET /api/v1/admin/health/deep` (apps/backend/src/admin/health-deep.routes.ts) already serves
 *     deep health, IS mounted (index.ts), and IS gated: `requireAuth` + Owner-only + entity-scoped
 *     via `resolveDefaultOperatingCompanyIdForUser`. Verified live: it answers 401 unauthenticated.
 *   - Two of the four checks here query tables that DO NOT EXIST in db/migrations/: `qbo.connections`
 *     (the real table is `integrations.qbo_connections`) and `banking.plaid_items` (no such table
 *     anywhere). Both would short-circuit to "skipped" via `regclassExists`. Bolting auth onto a
 *     phantom-schema duplicate would resurrect dead code instead of removing an exposure.
 *
 * Per Rule 07 (ARCHIVE, never DELETE) the file and its check functions are retained unchanged for
 * history and for anyone auditing what the endpoint used to expose. Only the registrar changed, and
 * it now THROWS: accidental future wiring fails loudly at boot instead of silently re-publishing
 * integration state. Guarded by scripts/verify-steps/1590-verify-no-unauth-integration-state-route.mjs.
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

/** A skipped (unconfigured) dependency does not fail the deep check.
 *  Exported as part of the archived surface — retained (Rule 07) but no longer reachable by HTTP. */
export function isFailing(check: DependencyCheckResult): boolean {
  return check.critical && (check.status === "down" || check.status === "degraded");
}

/** Message thrown when something tries to wire the archived registrar. Exported so the test can
 *  assert the exact contract rather than matching a substring that could drift. */
export const ARCHIVED_DEEP_HEALTH_ERROR =
  "registerDeepHealthRoutes is ARCHIVED (security, 2026-07-25): it registered an unauthenticated " +
  "GET /api/v1/health/deep that disclosed QuickBooks/Samsara/Plaid connection state, last-sync " +
  "timestamps and raw error strings to anonymous callers. Use the authenticated, Owner-gated " +
  "GET /api/v1/admin/health/deep (apps/backend/src/admin/health-deep.routes.ts) instead. Do not " +
  "re-register this route; see the header of this file.";

/**
 * ARCHIVED — intentionally refuses to register. Throwing (rather than quietly no-op'ing) is the
 * point: a future aggregator import, autoload sweep or copy-paste that reaches this function fails
 * at boot, in CI, where a human sees it — instead of silently publishing integration state.
 */
export function registerDeepHealthRoutes(_app: FastifyInstance): never {
  logger.warn("health.deep.archived_registration_attempt", { route: "/api/v1/health/deep" });
  throw new Error(ARCHIVED_DEEP_HEALTH_ERROR);
}
