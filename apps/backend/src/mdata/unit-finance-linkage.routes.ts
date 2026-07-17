import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getUnitFinanceLinkage } from "./unit-finance-linkage.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const RL_READ = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

export async function registerUnitFinanceLinkageRoutes(app: FastifyInstance) {
  // CodeQL: authorized routes must be rate-limited (match peer mdata GET handlers).
  app.get("/api/v1/mdata/units/:id/finance-linkage", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const linkage = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [
        parsedQuery.data.operating_company_id,
      ]);
      return getUnitFinanceLinkage(client, parsedQuery.data.operating_company_id, parsedParams.data.id);
    });

    if (!linkage) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return linkage;
  });
}
