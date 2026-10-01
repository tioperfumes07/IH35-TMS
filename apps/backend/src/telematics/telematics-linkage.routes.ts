import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { loadTelematicsLinks, unitTelematicsLinks } from "./telematics-linkage.service.js";

const query = z.object({ operating_company_id: z.string().uuid(), days: z.coerce.number().int().min(1).max(365).optional() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** Linkage law, reverse direction: load -> and unit -> everything the telematics engines recorded. Read-only. */
export async function registerTelematicsLinkageRoutes(app: FastifyInstance) {
  for (const [path, kind] of [["/api/v1/loads/:id/telematics", "load"], ["/api/v1/units/:id/telematics", "unit"]] as const) {
    app.get(path, { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const p = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
      const q = query.safeParse(req.query ?? {});
      if (!p.success || !q.success) return reply.code(400).send({ error: "validation_error" });
      await assertCompanyMembership(user.uuid, q.data.operating_company_id);
      const out = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
        return kind === "load"
          ? loadTelematicsLinks(client as never, q.data.operating_company_id, p.data.id)
          : unitTelematicsLinks(client as never, q.data.operating_company_id, p.data.id, q.data.days ?? 30);
      });
      if (!out) return reply.code(404).send({ error: `${kind}_not_found` });
      return out;
    });
  }
}
