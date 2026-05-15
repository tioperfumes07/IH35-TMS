import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { runAdminDeepHealthProbe } from "./health-deep.service.js";

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
      const probe = await runAdminDeepHealthProbe();
      const criticalOk = probe.checks.filter((c) => c.tier === "critical").every((c) => c.ok);
      const payload = {
        ok: criticalOk,
        checks: probe.checks,
        total_ms: probe.total_ms,
      };
      return reply.code(criticalOk ? 200 : 503).send(payload);
    } catch (error) {
      app.log.error({ err: error }, "[health-deep] probe_failed");
      return reply.code(500).send({ error: "health_deep_failed" });
    }
  });
}
