import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { runFuelPurchasePush } from "./fuel-purchase-push.service.js";
import { fuelPurchasePushApplyEnabled } from "./fuel-purchase-push.cron.js";

const query = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 304 T-48 -- read-only: what the next push tick would send to Samsara and what it would skip, and why. */
export async function registerFuelPurchasePushRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/integrations/samsara/fuel-purchase-push/plan",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const q = query.safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
      await assertCompanyMembership(user.uuid, q.data.operating_company_id);
      return withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
        const plan = await runFuelPurchasePush(client as never, q.data.operating_company_id, { apply: false, poster: null });
        return { ...plan, cron_apply_enabled: fuelPurchasePushApplyEnabled() };
      });
    }
  );
}
