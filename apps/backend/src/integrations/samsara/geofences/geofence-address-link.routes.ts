import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";
import { acceptProposal, runGeofenceAddressLink } from "./geofence-address-link.service.js";
import { planFencePush, pushFencesToSamsara, samsaraFencePushEnabled } from "./fence-push.service.js";
import { SamsaraClient } from "../samsara-client.js";
import { resolveSamsaraApiToken } from "../samsara-token.js";
import { getSamsaraConfigForCompany } from "../samsara.service.js";

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

  // ROUND 306 E-07 addition — our fences with no Samsara counterpart: read-only plan, and a flag-gated push.
  app.get("/api/v1/geofences/samsara-push/plan", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [q.data.operating_company_id]);
      return planFencePush(client as never, q.data.operating_company_id);
    });
  });

  app.post("/api/v1/geofences/samsara-push", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!LINK_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    if (!samsaraFencePushEnabled()) return reply.code(409).send({ error: "samsara_fence_push_disabled" });
    const body = z.object({ operating_company_id: z.string().uuid(), kinds: z.array(z.string().min(1)).min(1) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [body.data.operating_company_id]);
      const cfg = await getSamsaraConfigForCompany(client as never, body.data.operating_company_id);
      if (!cfg) return reply.code(409).send({ error: "samsara_not_configured" });
      const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });
      return pushFencesToSamsara(client as never, body.data.operating_company_id, body.data.kinds, api);
    });
  });
}
