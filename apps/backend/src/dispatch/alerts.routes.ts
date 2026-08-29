import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listLateArrivalLoads } from "./late-arrivals.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

export async function registerDispatchAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/alerts/late-arrivals", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    // G2-2: a uuid-valid operating_company_id is NOT proof the caller belongs to that company. Without this
    // assertion an authenticated user of company A could pass company B's id and read B's late-arrival loads
    // (cross-entity leak — the class this whole subset closes). Membership is app-layer; RLS only matches the
    // value we SET, so it cannot substitute for this check.
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    return listLateArrivalLoads(user.uuid, query.data.operating_company_id);
  });
}
