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

    const payload = await withLuciaBypass(async (client) => {
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

      const now = Date.now();
      const lastOkMs =
        lastSuccessfulSyncAt && !Number.isNaN(new Date(lastSuccessfulSyncAt).getTime())
          ? now - new Date(lastSuccessfulSyncAt).getTime()
          : null;

      let status: "healthy" | "syncing" | "stale" | "error";
      if (errorCount > 0) {
        status = "error";
      } else if (lastOkMs === null || lastOkMs > 30 * 60 * 1000) {
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
      };
    });

    cache.set(key, payload, CACHE_MS);
    return payload;
  });
}
