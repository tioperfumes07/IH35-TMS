import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { buildLaunchReadinessPayload } from "./launch-readiness.service.js";

function allowLaunchReadiness(role: string | undefined): boolean {
  const r = String(role ?? "");
  return r === "Owner" || r === "Administrator";
}

export async function registerLaunchReadinessRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/launch-readiness", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!allowLaunchReadiness(req.user?.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    try {
      const payload = await buildLaunchReadinessPayload();
      return payload;
    } catch (error) {
      app.log.error({ err: error }, "[launch-readiness] failed");
      return reply.code(500).send({ error: "launch_readiness_failed" });
    }
  });
}
