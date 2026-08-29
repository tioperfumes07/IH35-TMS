import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getSamsaraConfigForCompany } from "./samsara/samsara.service.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

export async function registerIntegrationHealthRoutes(app: FastifyInstance) {
  app.get("/api/integrations/health", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    let health;
    try {
      health = await withCurrentUser(req.user!.uuid, async (client) => {
        // CLS-GUC-BASELINE (MDATA-F09 class) — operating_company_id arrives in the query string;
        // assert membership BEFORE the GUC set, or RLS enforces whatever the caller asked for.
        await setScopedCompanyContext(client, req.user!.uuid, q.data.operating_company_id);
        const cfg = await getSamsaraConfigForCompany(client, q.data.operating_company_id);
        const veh = await client.query(`SELECT COUNT(*)::int AS cnt FROM integrations.samsara_vehicles WHERE operating_company_id = $1::uuid`, [q.data.operating_company_id]);
        const drv = await client.query(`SELECT COUNT(*)::int AS cnt FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid`, [q.data.operating_company_id]);
        const lastCheck = cfg?.last_health_check_at ? new Date(String(cfg.last_health_check_at)) : null;
        const fresh = lastCheck ? (Date.now() - lastCheck.getTime()) < 86400000 : false;
        const samsara = cfg && fresh && Number(veh.rows[0]?.cnt ?? 0) > 0 ? "green" : cfg ? "yellow" : "red";
        return { samsara, samsara_config: Boolean(cfg), vehicle_rows: Number(veh.rows[0]?.cnt ?? 0), driver_rows: Number(drv.rows[0]?.cnt ?? 0), last_health_check_at: lastCheck?.toISOString() ?? null };
      });
    } catch (err) {
      if ((err as Error & { statusCode?: number })?.statusCode === 403) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }
    return health;
  });
}
