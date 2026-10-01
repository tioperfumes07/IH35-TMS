import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";
import { acceptProposal, runGeofenceAddressLink } from "./geofence-address-link.service.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const acceptBody = z.object({ operating_company_id: z.string().uuid(), samsara_address_id: z.string().min(1) });
const LINK_ROLES = new Set(["Owner", "Administrator", "Manager"]);

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 304 T-46 -- read the live link plan (dry-run, never writes) and let a human accept a proposal. */
export async function registerGeofenceAddressLinkRoutes(app: FastifyInstance) {
  app.get("/api/v1/geofences/samsara-address-links", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return runGeofenceAddressLink({ operatingCompanyId: q.data.operating_company_id });
  });

  app.post("/api/v1/geofences/:id/samsara-address-link", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!LINK_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = acceptBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [body.data.operating_company_id]);
      return acceptProposal(client as never, {
        operatingCompanyId: body.data.operating_company_id,
        fenceId: params.data.id,
        samsaraAddressId: body.data.samsara_address_id,
        actorUserId: user.uuid,
      });
    });
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(200).send({ linked: true });
  });
}
