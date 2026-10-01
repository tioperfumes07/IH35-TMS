import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { driverAssignmentHistory, driverFuel, driverSafety, driverSamsaraLink, driverStopsAndMiles } from "./driver-profile-tabs.service.js";

const params = z.object({ driverId: z.string().uuid() });
const query = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const TABS = {
  assignments: (c: never, oc: string, id: string, w: { fromIso: string; toIso: string }) => driverAssignmentHistory(c, oc, id, w),
  "stops-miles": (c: never, oc: string, id: string, w: { fromIso: string; toIso: string }) => driverStopsAndMiles(c, oc, id, w),
  fuel: (c: never, oc: string, id: string, w: { fromIso: string; toIso: string }) => driverFuel(c, oc, id, w),
  safety: (c: never, oc: string, id: string, w: { fromIso: string; toIso: string }) => driverSafety(c, oc, id, w),
  samsara: (c: never, oc: string, id: string) => driverSamsaraLink(c, oc, id),
} as const;

/** ORDERS 2026-10-01 row 4 -- driver profile tabs, read-only, one endpoint per tab. Default window: last 30 days. */
export async function registerDriverProfileTabRoutes(app: FastifyInstance) {
  for (const [tab, fn] of Object.entries(TABS)) {
    app.get(`/api/v1/drivers/:driverId/profile/${tab}`, { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const p = params.safeParse(req.params ?? {});
      const q = query.safeParse(req.query ?? {});
      if (!p.success || !q.success) return reply.code(400).send({ error: "validation_error" });
      await assertCompanyMembership(user.uuid, q.data.operating_company_id);
      const to = q.data.to ?? new Date().toISOString().slice(0, 10);
      const from = q.data.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      return withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
        const owns = await client.query(`SELECT 1 FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.data.driverId, q.data.operating_company_id]);
        if (owns.rows.length === 0) return reply.code(404).send({ error: "driver_not_found" });
        return fn(client as never, q.data.operating_company_id, p.data.driverId, { fromIso: `${from}T00:00:00Z`, toIso: `${to}T23:59:59Z` });
      });
    });
  }
}
