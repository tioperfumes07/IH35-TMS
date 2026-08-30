import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listLateArrivalLoads } from "./late-arrivals.service.js";
import { dispatchAlertDateRangeIsValid, dispatchAlertQueryFields } from "./dispatch-alert-query.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  ...dispatchAlertQueryFields,
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatchAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/alerts/late-arrivals", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    if (!dispatchAlertDateRangeIsValid(query.data)) return reply.code(400).send({ error: "invalid_date_range" });
    // G2-2: a uuid-valid operating_company_id is NOT proof the caller belongs to that company. Without this
    // assertion an authenticated user of company A could pass company B's id and read B's late-arrival loads
    // (cross-entity leak — the class this whole subset closes). Membership is app-layer; RLS only matches the
    // value we SET, so it cannot substitute for this check.
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    return listLateArrivalLoads(user.uuid, query.data.operating_company_id, query.data);
  });
}
