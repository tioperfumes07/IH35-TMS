// Lead 2026-10-02 — a negative Faro Cash Reserve presents as a payable to Faro at period end (cash-reserve-reclass.service.ts).
//   GET  /api/v1/factoring/cash-reserve-reclass?operating_company_id=&period=YYYY-MM   status for the period end
//   POST /api/v1/factoring/cash-reserve-reclass { operating_company_id, period }        Owner / Administrator / Accountant
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { INTEREST_ACCRUAL_ROLES, periodBounds } from "./interest-accrual.service.js";
import { CashReserveReclassError, cashReserveReclassStatus, postCashReserveReclass } from "./cash-reserve-reclass.service.js";

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const q = z.object({ operating_company_id: z.string().uuid(), period });

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof CashReserveReclassError) return reply.code(409).send({ error: err.code });
  throw err;
}

export async function registerCashReserveReclassRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/cash-reserve-reclass", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = q.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    const { period_end } = periodBounds(p.data.period);
    return withCompanyScope(user.uuid, p.data.operating_company_id, (c) => cashReserveReclassStatus(c, p.data.operating_company_id, period_end));
  });

  app.post("/api/v1/factoring/cash-reserve-reclass", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!INTEREST_ACCRUAL_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "cash_reserve_reclass_restricted" });
    const b = q.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    const { period_end } = periodBounds(b.data.period);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        postCashReserveReclass(c, {
          operating_company_id: b.data.operating_company_id,
          period_end,
          actor_user_id: user.uuid,
          actor_role: String(user.role ?? ""),
        })
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
