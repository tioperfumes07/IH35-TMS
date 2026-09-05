import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { getLivePositionsForActiveLoads, getPositionForUnit } from "./live-position.service.js";
import { listRealDrivenMilesForLoad } from "../geofences/real-driven-miles.service.js";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerSamsaraLivePositionRoutes(app: FastifyInstance) {
  app.get("/api/integrations/samsara/loads/:load_uuid/real-miles", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ load_uuid: z.string().uuid() }).safeParse(req.params ?? {});
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const row = await withCurrentUser(user.uuid, async (client) =>
      listRealDrivenMilesForLoad(client, q.data.operating_company_id, params.data.load_uuid)
    );
    if (!row) return reply.code(404).send({ error: "load_not_found" });
    return { mileage: row };
  });

  app.get("/api/integrations/samsara/positions/active-loads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const rows = await withCurrentUser(user.uuid, async (client) =>
      getLivePositionsForActiveLoads(client, q.data.operating_company_id)
    );
    return { positions: rows };
  });

  app.get("/api/integrations/samsara/positions/unit/:unit_uuid", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ unit_uuid: z.string().uuid() }).safeParse(req.params ?? {});
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) =>
      getPositionForUnit(client, q.data.operating_company_id, params.data.unit_uuid)
    );
    return { position: row };
  });

  app.get("/api/integrations/samsara/positions/driver/self", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid(), unit_uuid: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) =>
      getPositionForUnit(client, q.data.operating_company_id, q.data.unit_uuid)
    );
    return { position: row };
  });
}
