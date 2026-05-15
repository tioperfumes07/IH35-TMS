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

      if (connTbl.rows[0]?.ok) {
        const connRes = await client.query<{ exp: string | null }>(
          `
            SELECT MIN(refresh_token_expires_at) FILTER (WHERE revoked_at IS NULL)::text AS exp
            FROM integrations.qbo_connections
            WHERE operating_company_id = $1::uuid
          `,
          [parsed.data.operating_company_id]
        );
        refreshTokenExpiresAt = connRes.rows[0]?.exp ?? null;
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
                OR lower(coalesce(error_message, '')) LIKE '%refresh%'
                OR lower(coalesce(error_message, '')) LIKE '%oauth%'
              )
          `,
          [parsed.data.operating_company_id]
        );
        tokenAlertCount = Number(tokRes.rows[0]?.c ?? 0);
      }

      const now = Date.now();
      const lastOkMs =
        lastSuccessfulSyncAt && !Number.isNaN(new Date(lastSuccessfulSyncAt).getTime())
          ? now - new Date(lastSuccessfulSyncAt).getTime()
          : null;

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
        status = "healthy";
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
