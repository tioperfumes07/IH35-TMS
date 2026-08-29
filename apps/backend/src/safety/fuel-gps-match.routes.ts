import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { runFuelGpsRematchForTransaction } from "./fuel-gps-match.service.js";

const paramsSchema = z.object({ transaction_id: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerFuelGpsMatchRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/fuel-gps-match/rematch/:transaction_id", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const ok = await withCurrentUser(user.uuid, async (client) => {
        await assertCompanyMembership(client, user.uuid, query.data.operating_company_id);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);
        return runFuelGpsRematchForTransaction(client, query.data.operating_company_id, params.data.transaction_id);
      });
      if (!ok) return reply.code(404).send({ error: "transaction_not_found" });
      return { ok: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "forbidden_company_membership") {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }
  });
}
