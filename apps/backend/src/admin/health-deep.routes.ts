import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import {
  buildIdempotencyKey,
  enqueueAdminJob,
  getLatestCompletedAdminJob,
  resolveDefaultOperatingCompanyIdForUser,
} from "./admin-jobs.service.js";

function allowDeepHealth(role: string | undefined): boolean {
  return String(role ?? "") === "Owner";
}

type DeepHealthCheck = {
  name: string;
  ok: boolean;
  tier: "critical" | "non_critical";
  duration_ms: number;
  skipped?: boolean;
  error?: string;
};

function criticalHealthStatus(checks: DeepHealthCheck[]): boolean {
  return checks.filter((check) => check.tier === "critical").every((check) => check.ok);
}

export async function registerHealthDeepRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/health/deep", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!allowDeepHealth(req.user?.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const user = req.user as { uuid: string };
      const operatingCompanyId = await resolveDefaultOperatingCompanyIdForUser(user.uuid);
      const latest = operatingCompanyId
        ? await getLatestCompletedAdminJob("admin.health.deep.refresh", operatingCompanyId)
        : null;
      const staleMs = 10 * 60 * 1000;
      const lastProbedAt = latest?.completed_at ? new Date(latest.completed_at).getTime() : null;
      const isStale = !lastProbedAt || Number.isNaN(lastProbedAt) || Date.now() - lastProbedAt > staleMs;

      let refreshJobId: string | null = null;
      if (isStale && operatingCompanyId) {
        try {
          refreshJobId = await enqueueAdminJob({
            operation: "admin.health.deep.refresh",
            operatingCompanyId,
            requestedByUserId: user.uuid,
            idempotencyKey: buildIdempotencyKey({
              operation: "admin.health.deep.refresh",
              operatingCompanyId,
              integration: "deep_health",
              nowMs: Date.now(),
            }),
            payload: { trigger: "admin.health.deep", integration: "deep_health" },
            maxAttempts: 3,
          });
        } catch (enqueueError) {
          req.log.warn({ err: enqueueError }, "[health-deep] refresh_enqueue_failed");
        }
      }

      if (!latest?.result) {
        return reply.code(200).send({
          ok: true,
          checks: [],
          total_ms: 0,
          stale: true,
          refresh_enqueued: Boolean(refreshJobId),
          refresh_job_id: refreshJobId,
          last_probed_at: null,
          cache_age_seconds: null,
        });
      }

      const checks = (Array.isArray(latest.result.checks) ? latest.result.checks : []) as DeepHealthCheck[];
      const criticalOk = criticalHealthStatus(checks);
      const cacheAgeSeconds = Math.max(0, Math.floor((Date.now() - (lastProbedAt ?? Date.now())) / 1000));
      return reply.code(criticalOk ? 200 : 503).send({
        ok: criticalOk,
        checks,
        total_ms: Number(latest.result.total_ms ?? 0),
        stale: isStale,
        refresh_enqueued: Boolean(refreshJobId),
        refresh_job_id: refreshJobId,
        last_probed_at: latest.completed_at,
        cache_age_seconds: cacheAgeSeconds,
      });
    } catch (error) {
      app.log.error({ err: error }, "[health-deep] probe_failed");
      return reply.code(500).send({ error: "health_deep_failed" });
    }
  });
}
