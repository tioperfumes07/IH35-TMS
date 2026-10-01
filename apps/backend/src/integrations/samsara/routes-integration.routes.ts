import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { buildRoutePushPlan, listLeaseScopedDispatchedRoutes, pushLeaseScopedDispatchedRoute, samsaraRoutesPushEnabled } from "./routes-integration.service.js";

function authed(req: FastifyRequest, reply: FastifyReply) { return requireAuth(req, reply) ? req.user : null; }
const query = z.object({ operating_company_id: z.string().uuid() });

export async function registerSamsaraRoutesIntegration(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/routes/eligible", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = query.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const routes = await withCurrentUser(user.uuid, (client) => listLeaseScopedDispatchedRoutes(client, q.data.operating_company_id));
    return { count: routes.length, routes };
  });
  // ROUND 306 E-31: read-only — exactly what would be sent to Samsara per load, or why it is skipped.
  app.get("/api/v1/integrations/samsara/routes/plan", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = query.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const plan = await withCurrentUser(user.uuid, (client) => buildRoutePushPlan(client, q.data.operating_company_id));
    return { push_enabled: samsaraRoutesPushEnabled(), count: plan.length, plan };
  });
  app.post("/api/v1/integrations/samsara/routes/:load_id/push", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = query.safeParse(req.query ?? {}); const p = z.object({ load_id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!q.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const result = await withCurrentUser(user.uuid, (client) => pushLeaseScopedDispatchedRoute(client, q.data.operating_company_id, p.data.load_id));
    return { ok: true, route: result };
  });
}
