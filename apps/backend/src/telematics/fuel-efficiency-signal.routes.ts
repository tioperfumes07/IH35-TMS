import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { decryptSamsaraSecret } from "../lib/samsara-crypto.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { computeFuelEfficiencySignals } from "./fuel-efficiency-signal.service.js";

const query = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 304 T-50 -- Samsara ECU fuel burn per unit/driver beside our purchased gallons (read-only). */
export async function registerFuelEfficiencySignalRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/fuel-efficiency-signal", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = query.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
      const to = q.data.to ?? new Date().toISOString().slice(0, 10);
      const from = q.data.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      return computeFuelEfficiencySignals(client as never, {
        operatingCompanyId: q.data.operating_company_id,
        fromIso: `${from}T00:00:00Z`,
        toIso: `${to}T00:00:00Z`,
        fetchReports: async (kind) => {
          const config = await getSamsaraConfigForCompany(client as never, q.data.operating_company_id);
          const encrypted = config?.encrypted_api_token ?? config?.api_token_encrypted;
          if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw new Error("samsara_not_configured");
          return new SamsaraClient({ apiToken: decryptSamsaraSecret(encrypted), samsaraOrgId: null }).listFuelEnergyReports(kind, `${from}T00:00:00Z`, `${to}T00:00:00Z`);
        },
      });
    });
  });
}
