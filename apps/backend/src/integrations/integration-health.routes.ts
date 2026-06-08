import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getSamsaraConfigForCompany } from "./samsara/samsara.service.js";

export async function registerIntegrationHealthRoutes(app: FastifyInstance) {
  app.get("/api/integrations/health", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const health = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const cfg = await getSamsaraConfigForCompany(client, q.data.operating_company_id);
      const veh = await client.query(`SELECT COUNT(*)::int AS cnt FROM integrations.samsara_vehicles WHERE operating_company_id = $1::uuid`, [q.data.operating_company_id]);
      const drv = await client.query(`SELECT COUNT(*)::int AS cnt FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid`, [q.data.operating_company_id]);
      const lastCheck = cfg?.last_health_check_at ? new Date(String(cfg.last_health_check_at)) : null;
      const fresh = lastCheck ? (Date.now() - lastCheck.getTime()) < 86400000 : false;
      const samsara = cfg && fresh && Number(veh.rows[0]?.cnt ?? 0) > 0 ? "green" : cfg ? "yellow" : "red";
      return { samsara, samsara_config: Boolean(cfg), vehicle_rows: Number(veh.rows[0]?.cnt ?? 0), driver_rows: Number(drv.rows[0]?.cnt ?? 0), last_health_check_at: lastCheck?.toISOString() ?? null };
    });
    return health;
  });
}
