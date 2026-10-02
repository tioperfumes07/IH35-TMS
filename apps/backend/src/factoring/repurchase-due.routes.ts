// Lead ROUND 296 / 297 — the day-95 Repurchase Deadline decision queue. Day 95 ASKS; it never recourses.
//   GET  /api/v1/factoring/repurchase-due?operating_company_id=&state=awaiting_owner|all
//   POST /api/v1/factoring/repurchase-due/:id/decide  { operating_company_id, decision, extended_to?, note? }   (Owner only)
// A decision records the owner's answer and posts nothing (repurchase-due.service.ts).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import {
  REPURCHASE_DUE_DECISIONS,
  RepurchaseDueDecisionError,
  decideRepurchaseDue,
  listRepurchaseDue,
} from "./repurchase-due.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = z.object({
  operating_company_id: z.string().uuid(),
  state: z.enum(["awaiting_owner", "all"]).default("awaiting_owner"),
});
const decideParams = z.object({ id: z.string().uuid() });
const decideBody = z.object({
  operating_company_id: z.string().uuid(),
  decision: z.enum(REPURCHASE_DUE_DECISIONS),
  extended_to: isoDate.nullish(),
  note: z.string().max(500).nullish(),
});

export async function registerRepurchaseDueRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/repurchase-due", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = listQuery.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    const asOf = companyBusinessDate();
    const rows = await withCompanyScope(user.uuid, p.data.operating_company_id, (client) =>
      listRepurchaseDue(client, p.data.operating_company_id, asOf, p.data.state)
    );
    return { as_of: asOf, rows };
  });

  app.post(
    "/api/v1/factoring/repurchase-due/:id/decide",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = decideParams.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = decideBody.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);
      // Owner only: "WHEN RECOURSE TIME ARRIVES IT MUST ASK" — the owner is who is asked.
      if (user.role !== "Owner") return reply.code(403).send({ error: "repurchase_due_decide_restricted" });
      try {
        return await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          decideRepurchaseDue(client, {
            operating_company_id: body.data.operating_company_id,
            event_id: params.data.id,
            decision: body.data.decision,
            extended_to: body.data.extended_to ?? null,
            note: body.data.note ?? null,
            actor_user_id: user.uuid,
          })
        );
      } catch (err) {
        if (err instanceof RepurchaseDueDecisionError) {
          return reply.code(err.code === "repurchase_due_event_not_found" ? 404 : 409).send({ error: err.code });
        }
        throw err;
      }
    }
  );
}
