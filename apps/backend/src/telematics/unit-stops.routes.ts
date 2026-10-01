import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { computeUnitStops } from "./unit-stops.service.js";

const query = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  geofence_id: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 306 E-04 -- E-03 stops with their fence + E-04 crossing captures (read-only). geofence_id = reverse. */
export async function registerUnitStopsRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/unit-stops", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = query.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const to = q.data.to ?? new Date().toISOString().slice(0, 10);
    const from = q.data.from ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
      return computeUnitStops(client as never, {
        operatingCompanyId: q.data.operating_company_id,
        unitId: q.data.unit_id,
        geofenceId: q.data.geofence_id,
        fromIso: `${from}T00:00:00Z`,
        toIso: `${to}T23:59:59Z`,
      });
    });
  });
}
