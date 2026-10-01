import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { computeDrivenMilesLegs } from "./driven-miles-legs.service.js";

const query = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 304 T-47 -- real driven miles per leg (read-only), with HOS drive distance as the second signal. */
export async function registerDrivenMilesLegsRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/driven-miles-legs", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = query.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const to = q.data.to ?? new Date().toISOString().slice(0, 10);
    const from = q.data.from ?? new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
      return computeDrivenMilesLegs(client as never, {
        operatingCompanyId: q.data.operating_company_id,
        fromIso: `${from}T00:00:00Z`,
        toIso: `${to}T23:59:59Z`,
        fetchHosLogs: async () => {
          const config = await getSamsaraConfigForCompany(client as never, q.data.operating_company_id);
          if (!config) throw new Error("samsara_not_configured");
          return new SamsaraClient({ apiToken: resolveSamsaraApiToken(config as Record<string, unknown>), samsaraOrgId: null }).listHosDailyLogs(from, to);
        },
      });
    });
  });
}
