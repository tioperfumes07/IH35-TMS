import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { getRunnerState } from "./runner-status.store.js";

export async function registerRunnerStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/qbo-forensic/runner-status", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { role?: string } | undefined;
    if (user?.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const state = getRunnerState();
    const startedAt = new Date(state.server_started_at);
    const uptimeMs = Number.isNaN(startedAt.getTime()) ? 0 : Date.now() - startedAt.getTime();

    return {
      forensic_runner: state.forensic_runner,
      sync_queue_runner: state.sync_queue_runner,
      token_refresh_cron: state.token_refresh_cron,
      server_uptime_seconds: Math.max(0, Math.floor(uptimeMs / 1000)),
      server_started_at: state.server_started_at,
    };
  });
}
