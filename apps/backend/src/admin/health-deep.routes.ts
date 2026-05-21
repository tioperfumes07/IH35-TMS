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

export async function registerHealthDeepRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/health/deep", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!allowDeepHealth(req.user?.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const user = req.user as { uuid: string };
      const operatingCompanyId = await resolveDefaultOperatingCompanyIdForUser(user.uuid);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_context_missing" });
      }

      const latest = await getLatestCompletedAdminJob("admin.health.deep.refresh", operatingCompanyId);
      const staleMs = 10 * 60 * 1000;
      const lastProbedAt = latest?.completed_at ? new Date(latest.completed_at).getTime() : null;
      const isStale = !lastProbedAt || Number.isNaN(lastProbedAt) || Date.now() - lastProbedAt > staleMs;

      let refreshJobId: string | null = null;
      if (isStale) {
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
        });
      }

      const checks = Array.isArray(latest.result.checks) ? latest.result.checks : [];
      const criticalOk = checks
        .filter((check) => check && typeof check === "object" && check.tier === "critical")
        .every((check) => (check as { ok?: unknown }).ok === true);
      return reply.code(criticalOk ? 200 : 503).send({
        ok: criticalOk,
        checks,
        total_ms: Number(latest.result.total_ms ?? 0),
        stale: isStale,
        refresh_enqueued: Boolean(refreshJobId),
        refresh_job_id: refreshJobId,
        last_probed_at: latest.completed_at,
      });
    } catch (error) {
      app.log.error({ err: error }, "[health-deep] probe_failed");
      return reply.code(500).send({ error: "health_deep_failed" });
    }
  });
}
