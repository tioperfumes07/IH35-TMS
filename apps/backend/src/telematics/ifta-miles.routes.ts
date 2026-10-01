import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { decryptSamsaraSecret } from "../lib/samsara-crypto.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { computeIftaMiles } from "./ifta-miles.service.js";

const query = z
  .object({
    operating_company_id: z.string().uuid(),
    year: z.coerce.number().int().min(2020).max(2100),
    month: z.coerce.number().int().min(1).max(12).optional(),
    quarter: z.coerce.number().int().min(1).max(4).optional(),
  })
  .refine((q) => (q.month == null) !== (q.quarter == null), { message: "exactly one of month or quarter" });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 304 T-49 -- IFTA miles by jurisdiction (Samsara, read-only) beside our tax-paid gallons. */
export async function registerIftaMilesRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/ifta-miles", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = query.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
      return computeIftaMiles(client as never, {
        operatingCompanyId: q.data.operating_company_id,
        period: { year: q.data.year, month: q.data.month, quarter: q.data.quarter as 1 | 2 | 3 | 4 | undefined },
        fetchReport: async (p) => {
          const config = await getSamsaraConfigForCompany(client as never, q.data.operating_company_id);
          const encrypted = config?.encrypted_api_token ?? config?.api_token_encrypted;
          if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw new Error("samsara_not_configured");
          return new SamsaraClient({ apiToken: decryptSamsaraSecret(encrypted), samsaraOrgId: null }).listIftaVehicleReports(p);
        },
      });
    });
  });
}
