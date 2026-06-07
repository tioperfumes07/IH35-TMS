/**
 * GAP-68 — Safety Officer Role Home Routes
 *
 * GET /api/safety-officer/role-home — Safety Officer home KPIs + alerts
 *
 * RBAC: Safety, Owner, Administrator roles.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { getSafetyHomeData } from "./safety-home.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function safetyOfficerOrAdmin(role: string): boolean {
  return role === "Safety" || role === "Owner" || role === "Administrator";
}

function authedSafetyOfficer(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (!safetyOfficerOrAdmin(user.role)) {
    reply.code(403).send({ error: "forbidden", message: "Safety Officer, Owner, or Administrator role required" });
    return null;
  }
  return user;
}

export async function registerSafetyOfficerRoleHomeRoutes(app: FastifyInstance) {
  app.get("/api/safety-officer/role-home", async (req, reply) => {
    const user = authedSafetyOfficer(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", issues: parsed.error.issues });
    }

    const { operating_company_id } = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${operating_company_id}'`);
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

      const data = await getSafetyHomeData(client, operating_company_id);
      return reply.send(data);
    });
  });
}
