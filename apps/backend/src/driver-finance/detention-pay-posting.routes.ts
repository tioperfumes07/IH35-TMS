// DWELL-01-D3-DETENTION-DRIVER-PAY-SETTLEMENT-LINE — thin route wrapper over
// detention-pay-posting.service.ts's postDetentionPayForEvent(). Same settlement-authority role
// tier as settlement-payrun-close.routes.ts (Owner/Administrator/Accountant) since this writes a
// driver_finance.settlement_lines row, even though the source event lives in dispatch.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCompanyScope, validationError } from "../accounting/shared.js";
import { postDetentionPayForEvent } from "./detention-pay-posting.service.js";

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

const bodySchema = z.object({ operating_company_id: z.string().uuid() });
const paramsSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerDetentionPayPostingRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/dispatch/detention-events/:id/post-driver-pay",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      if (!AUTHORITY_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = bodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
        postDetentionPayForEvent(client, {
          detentionEventId: params.data.id,
          operatingCompanyId: body.data.operating_company_id,
          actorUserId: user.uuid,
        })
      );

      switch (result.kind) {
        case "not_found":
          return reply.code(404).send({ error: "detention_event_not_found" });
        case "not_closed":
          return reply.code(409).send({ error: "detention_event_not_closed", status: result.status });
        case "no_driver":
          return reply.code(409).send({ error: "detention_event_has_no_driver" });
        case "no_evidence":
          return reply.code(409).send({ error: "detention_event_has_no_evidence", detail: "No event, no line — evidence is required before driver pay can post" });
        case "already_posted":
          return reply.code(409).send({ error: "detention_pay_already_posted", settlement_line_id: result.settlementLineId });
        case "no_active_settlement":
          return reply.code(409).send({ error: "driver_has_no_active_settlement", detail: "No open load_bookended settlement for this driver — refusing to invent one" });
        case "no_driver_pay_rate":
          return reply.code(409).send({ error: "load_has_no_driver_detention_pay_rate", detail: "mdata.loads.detention_driver_pay_per_hour_cents is unset or zero for this load" });
        case "no_billable_minutes":
          return reply.code(409).send({ error: "detention_event_has_no_billable_minutes" });
        case "ok":
          return reply.code(200).send({
            settlement_line_id: result.settlementLineId,
            settlement_id: result.settlementId,
            amount_cents: result.amountCents,
            billable_minutes: result.billableMinutes,
          });
      }
    }
  );
}
