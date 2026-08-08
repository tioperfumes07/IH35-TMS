import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { getSamsaraConfigForCompany } from "./samsara/samsara.service.js";

export async function registerIntegrationHealthRoutes(app: FastifyInstance) {
  // Rate-limited because this handler AUTHORIZES (CodeQL js/missing-rate-limiting,
  // verify-new-auth-routes-rate-limited). Adding the membership resolve is what brought it into
  // that guard's scope — an authorizing route is exactly the one worth rate-limiting.
  app.get("/api/integrations/health", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const health = await withCurrentUser(req.user!.uuid, async (client) => {
      // CLS-GUC-CALLER-SCOPED (MDATA-F09 class) — operating_company_id arrived in the query string,
      // was validated only as a UUID, and went straight into set_config, so the CALLER chose the
      // scope every FORCED-RLS policy then enforced. The three reads below also bind that same raw
      // value directly, so a caller naming another entity got that entity's Samsara config presence
      // and its vehicle/driver row counts. Under PERMANENT LAW 4 an "accessible companies" predicate
      // would not have helped: org.user_accessible_company_ids() returns EVERY active company for an
      // Owner session; membership in org.user_company_access is the real check.
      //
      // setScopedCompanyContext asserts membership and THEN sets the GUC in one call, so the
      // ordering cannot be got wrong, and it returns the id — which is bound below in place of the
      // raw parameter so the predicates and the GUC can never disagree.
      const scopedCompanyId = await setScopedCompanyContext(client, req.user!.uuid, q.data.operating_company_id);
      const cfg = await getSamsaraConfigForCompany(client, scopedCompanyId);
      const veh = await client.query(`SELECT COUNT(*)::int AS cnt FROM integrations.samsara_vehicles WHERE operating_company_id = $1::uuid`, [scopedCompanyId]);
      const drv = await client.query(`SELECT COUNT(*)::int AS cnt FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid`, [scopedCompanyId]);
      const lastCheck = cfg?.last_health_check_at ? new Date(String(cfg.last_health_check_at)) : null;
      const fresh = lastCheck ? (Date.now() - lastCheck.getTime()) < 86400000 : false;
      const samsara = cfg && fresh && Number(veh.rows[0]?.cnt ?? 0) > 0 ? "green" : cfg ? "yellow" : "red";
      return { samsara, samsara_config: Boolean(cfg), vehicle_rows: Number(veh.rows[0]?.cnt ?? 0), driver_rows: Number(drv.rows[0]?.cnt ?? 0), last_health_check_at: lastCheck?.toISOString() ?? null };
    });
    return health;
  });
}
