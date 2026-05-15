import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { currentAuthUser } from "../accounting/shared.js";
import { snapshotBufferedErrors } from "../lib/error-monitor-buffer.js";

function ownerAdministrator(role: string) {
  return role === "Owner";
}

export async function registerErrorMonitorRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/error-monitor/recent", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    return { errors: snapshotBufferedErrors(100) };
  });
}
