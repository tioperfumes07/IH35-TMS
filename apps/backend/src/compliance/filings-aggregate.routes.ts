import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { buildFilingsDashboard } from "./filings-aggregate.service.js";

const dashboardQuery = z.object({
  operating_company_id: z.string().uuid(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

// Cross-module "Compliance & Filings" aggregator — read-only. Entity-scoped (RLS via
// app.operating_company_id) + membership-gated; no role restriction beyond company membership since
// every operational role (Owner/Administrator/Manager/Accountant/Safety) needs visibility into what's
// due (owner decision 2026-07-05, memory `compliance-taxes-permits-module-org`).
export async function registerFilingsAggregateRoutes(app: FastifyInstance) {
  app.get("/api/v1/compliance/filings-dashboard", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = dashboardQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [query.data.operating_company_id]);
      return buildFilingsDashboard(client, query.data.operating_company_id);
    });
    return reply.send(payload);
  });
}
