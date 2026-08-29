import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { aggregateForPeriod, getDispatcherDetail } from "./booking-gap.service.js";
import { withCurrentUser } from "../../auth/db.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

const periodSchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function registerBookingGapRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/analytics/booking-gap", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const q = periodSchema.safeParse(req.query ?? {});
    if (!q.success) {
      return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    }

    const result = await withCurrentUser(user.uuid, async (client) => {
      await assertCompanyMembership(user.uuid, q.data.operating_company_id);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      return aggregateForPeriod(client, q.data.operating_company_id, q.data.from, q.data.to);
    });

    return reply.send({ data: result });
  });

  app.get("/api/v1/dispatch/analytics/booking-gap/dispatcher/:dispatcherId", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const { dispatcherId } = req.params as { dispatcherId: string };
    const q = periodSchema.safeParse(req.query ?? {});
    if (!q.success) {
      return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    }

    const detail = await getDispatcherDetail(
      user.uuid,
      q.data.operating_company_id,
      dispatcherId,
      q.data.from,
      q.data.to
    );
    if (!detail) return reply.code(404).send({ error: "not_found" });
    return reply.send({ data: detail });
  });
}
