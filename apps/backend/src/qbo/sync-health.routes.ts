import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import { getRunnerState } from "../admin/runner-status.store.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const cache = createTtlCache<Record<string, unknown>>();
const CACHE_MS = 30_000;

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function officeRole(role: string) {
  return role !== "Driver";
}

export async function registerQboSyncHealthRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo/sync-health", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const payload = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);

      const runsExist = await client.query(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
      const alertsExist = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
      const outboxExists = await client.query(`SELECT to_regclass('outbox.events') IS NOT NULL AS ok`);

      const latestRun = runsExist.rows[0]?.ok
        ? await client.query<{
            status: string;
            started_at: string | null;
            completed_at: string | null;
            run_kind: string | null;
          }>(
            `
              SELECT
                status,
                started_at::text,
                completed_at::text,
                kind AS run_kind
              FROM qbo.sync_runs
              WHERE operating_company_id = $1::uuid
              ORDER BY COALESCE(completed_at, started_at) DESC, started_at DESC
              LIMIT 1
            `,
            [parsed.data.operating_company_id]
          )
        : { rows: [] };

      const openAlertsCount = alertsExist.rows[0]?.ok
        ? await client.query<{ c: string }>(
            `
              SELECT COUNT(*)::text AS c
              FROM qbo.sync_alerts
              WHERE operating_company_id = $1::uuid
                AND resolved_at IS NULL
            `,
            [parsed.data.operating_company_id]
          )
        : { rows: [{ c: "0" }] };

      const highSeverityAlertsCount = alertsExist.rows[0]?.ok
        ? await client.query<{ c: string }>(
            `
              SELECT COUNT(*)::text AS c
              FROM qbo.sync_alerts
              WHERE operating_company_id = $1::uuid
                AND resolved_at IS NULL
                AND severity IN ('error', 'critical')
            `,
            [parsed.data.operating_company_id]
          )
        : { rows: [{ c: "0" }] };

      const failedOutboxCount = outboxExists.rows[0]?.ok
        ? await client.query<{ c: string }>(
            `
              SELECT COUNT(*)::text AS c
              FROM outbox.events e
              WHERE e.failed_at IS NOT NULL
                AND (
                  e.last_error ILIKE '%no handler registered%'
                  OR e.failed_at < now() - interval '1 hour'
                )
                AND COALESCE(e.payload->>'operating_company_id', '') = $1::text
            `,
            [parsed.data.operating_company_id]
          )
        : { rows: [{ c: "0" }] };

      const row = latestRun.rows[0];
      return {
        latest_run: row
          ? {
              status: row.status,
              started_at: row.started_at,
              completed_at: row.completed_at,
              run_kind: row.run_kind,
            }
          : null,
        open_alerts_count: Number(openAlertsCount.rows[0]?.c ?? 0),
        failed_outbox_count: Number(failedOutboxCount.rows[0]?.c ?? 0),
        high_severity_alerts_count: Number(highSeverityAlertsCount.rows[0]?.c ?? 0),
        last_updated: new Date().toISOString(),
      };
    });

    return payload;
  });

  app.get("/api/v1/qbo/sync/health", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const key = parsed.data.operating_company_id;
    const cached = cache.get(key);
    if (cached) return cached;

    let payload: Record<string, unknown>;
    try {
      payload = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);

      const alertsExist = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
      const queueExist = await client.query(`SELECT to_regclass('integrations.qbo_sync_queue') IS NOT NULL AS ok`);
      const runsExist = await client.query(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);

      let errorCount = 0;
      if (alertsExist.rows[0]?.ok) {
        const errRes = await client.query<{ c: string }>(
          `
            SELECT COUNT(*)::text AS c
            FROM qbo.sync_alerts
            WHERE operating_company_id = $1::uuid
              AND severity IN ('error', 'critical')
              AND resolved_at IS NULL
              AND created_at > now() - interval '24 hours'
          `,
          [parsed.data.operating_company_id]
        );
        errorCount = Number(errRes.rows[0]?.c ?? 0);
      }

      let pendingCount = 0;
      if (queueExist.rows[0]?.ok) {
        const pendRes = await client.query<{ c: string }>(
          `
            SELECT COUNT(*)::text AS c
            FROM integrations.qbo_sync_queue
            WHERE operating_company_id = $1::uuid
              AND sync_status IN ('pending', 'in_flight')
          `,
          [parsed.data.operating_company_id]
        );
        pendingCount = Number(pendRes.rows[0]?.c ?? 0);
      }

      let lastSuccessfulSyncAt: string | null = null;
      let lastFailedSyncAt: string | null = null;

      if (runsExist.rows[0]?.ok) {
        const okRes = await client.query<{ t: string | null }>(
          `
            SELECT MAX(completed_at)::text AS t
            FROM qbo.sync_runs
            WHERE operating_company_id = $1::uuid
              AND status = 'success'
          `,
          [parsed.data.operating_company_id]
        );
        lastSuccessfulSyncAt = okRes.rows[0]?.t ?? null;

        const badRes = await client.query<{ t: string | null }>(
          `
            SELECT MAX(completed_at)::text AS t
            FROM qbo.sync_runs
            WHERE operating_company_id = $1::uuid
              AND status = 'failed'
          `,
          [parsed.data.operating_company_id]
        );
        lastFailedSyncAt = badRes.rows[0]?.t ?? null;
      }

      if (!lastSuccessfulSyncAt && queueExist.rows[0]?.ok) {
        const fallback = await client.query<{ t: string | null }>(
          `
            SELECT MAX(synced_at)::text AS t
            FROM integrations.qbo_sync_queue
            WHERE operating_company_id = $1::uuid
              AND sync_status = 'synced'
          `,
          [parsed.data.operating_company_id]
        );
        lastSuccessfulSyncAt = fallback.rows[0]?.t ?? lastSuccessfulSyncAt;
      }

      const connTbl = await client.query(`SELECT to_regclass('integrations.qbo_connections') IS NOT NULL AS ok`);
      let refreshTokenExpiresAt: string | null = null;
      let hasActiveConnection = false;

      if (connTbl.rows[0]?.ok) {
        const connRes = await client.query<{ exp: string | null; has_active: boolean | null }>(
          `
            SELECT
              MIN(refresh_token_expires_at) FILTER (WHERE revoked_at IS NULL)::text AS exp,
              bool_or(revoked_at IS NULL) AS has_active
            FROM integrations.qbo_connections
            WHERE operating_company_id = $1::uuid
          `,
          [parsed.data.operating_company_id]
        );
        refreshTokenExpiresAt = connRes.rows[0]?.exp ?? null;
        hasActiveConnection = Boolean(connRes.rows[0]?.has_active);
      }

      // Master-data (CDC) freshness: the recurring vendor/customer/item/account sync writes to
      // mdata.qbo_sync_runs (NOT qbo.sync_runs), so a connected opco that fell off the recurring
      // schedule (e.g. TRANSP) shows ZERO rows here and must NOT read as healthy. A successful run
      // is finished_at IS NOT NULL AND error_message IS NULL.
      let masterDataLastSuccessAt: string | null = null;
      const mdataRunsExist = await client.query(`SELECT to_regclass('mdata.qbo_sync_runs') IS NOT NULL AS ok`);
      if (mdataRunsExist.rows[0]?.ok) {
        const mdRes = await client.query<{ t: string | null }>(
          `
            SELECT MAX(finished_at)::text AS t
            FROM mdata.qbo_sync_runs
            WHERE operating_company_id = $1::uuid
              AND finished_at IS NOT NULL
              AND error_message IS NULL
          `,
          [parsed.data.operating_company_id]
        );
        masterDataLastSuccessAt = mdRes.rows[0]?.t ?? null;
      }

      let tokenAlertCount = 0;
      if (alertsExist.rows[0]?.ok) {
        const tokRes = await client.query<{ c: string }>(
          `
            SELECT COUNT(*)::text AS c
            FROM qbo.sync_alerts
            WHERE operating_company_id = $1::uuid
              AND resolved_at IS NULL
              AND (
                lower(coalesce(error_code, '')) LIKE '%token%'
                OR lower(coalesce(message, '')) LIKE '%refresh%'
                OR lower(coalesce(message, '')) LIKE '%oauth%'
              )
          `,
          [parsed.data.operating_company_id]
        );
        tokenAlertCount = Number(tokRes.rows[0]?.c ?? 0);
      }

      const now = Date.now();
      // Effective freshness = the most recent successful sync across BOTH the push/queue sync
      // (qbo.sync_runs) and the recurring master-data CDC (mdata.qbo_sync_runs).
      const successCandidates = [lastSuccessfulSyncAt, masterDataLastSuccessAt]
        .filter((t): t is string => Boolean(t) && !Number.isNaN(new Date(String(t)).getTime()))
        .map((t) => new Date(String(t)).getTime());
      const effectiveLastSuccessMs = successCandidates.length > 0 ? Math.max(...successCandidates) : null;
      const lastOkMs = effectiveLastSuccessMs !== null ? now - effectiveLastSuccessMs : null;

      const refreshExpired =
        Boolean(refreshTokenExpiresAt) && !Number.isNaN(Date.parse(String(refreshTokenExpiresAt)))
          ? now >= Date.parse(String(refreshTokenExpiresAt))
          : false;

      const needsReconnect = refreshExpired || tokenAlertCount > 0;
      let reconnectReason: string | null = null;
      if (refreshExpired) reconnectReason = "quickbooks_refresh_token_expired";
      else if (tokenAlertCount > 0) reconnectReason = "quickbooks_token_alert";

      const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
      const neverSucceededWithFailures =
        !lastSuccessfulSyncAt && Boolean(lastFailedSyncAt) && !Number.isNaN(new Date(String(lastFailedSyncAt)).getTime());

      let status: "healthy" | "syncing" | "stale" | "error";
      if (needsReconnect) {
        status = "error";
      } else if (errorCount > 0) {
        status = "error";
      } else if (neverSucceededWithFailures) {
        status = "error";
      } else if (lastOkMs === null) {
        // A connected opco with NO recorded successful sync is stale (the misleading-green case),
        // not healthy. With no connection there is nothing to sync, so leave it healthy.
        status = hasActiveConnection ? "stale" : "healthy";
      } else if (lastOkMs > STALE_AFTER_MS) {
        status = "stale";
      } else if (pendingCount > 0 && lastOkMs < 5 * 60 * 1000) {
        status = "syncing";
      } else {
        status = "healthy";
      }

      const runners = getRunnerState();
      const workerUptimeSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(runners.server_started_at).getTime()) / 1000)
      );

      return {
        status,
        last_successful_sync_at: lastSuccessfulSyncAt,
        master_data_last_success_at: masterDataLastSuccessAt,
        has_active_connection: hasActiveConnection,
        last_failed_sync_at: lastFailedSyncAt,
        pending_count: pendingCount,
        error_count: errorCount,
        worker_uptime_seconds: workerUptimeSeconds,
        needs_reconnect: needsReconnect,
        reconnect_reason: reconnectReason,
        refresh_token_expires_at: refreshTokenExpiresAt,
        token_alert_count: tokenAlertCount,
      };
    });
    } catch (error) {
      req.log.error({ err: error }, "qbo_sync_health_failed");
      payload = {
        status: "error",
        last_successful_sync_at: null,
        last_failed_sync_at: null,
        pending_count: 0,
        error_count: 0,
        worker_uptime_seconds: 0,
        needs_reconnect: true,
        reconnect_reason: "qbo_sync_health_query_failed",
        refresh_token_expires_at: null,
        token_alert_count: 0,
      };
    }

    const enriched: Record<string, unknown> = {
      ...payload,
      healthy: payload.status === "healthy",
      lastRunAt: payload.last_successful_sync_at ?? payload.last_failed_sync_at ?? null,
      lastSuccessAt: payload.last_successful_sync_at ?? null,
      queueDepth: payload.pending_count ?? 0,
      retryDepth: payload.error_count ?? 0,
      failingItems: [],
    };

    cache.set(key, enriched, CACHE_MS);
    return enriched;
  });
}
