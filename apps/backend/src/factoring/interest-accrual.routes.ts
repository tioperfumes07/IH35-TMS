// Lead ROUND 296 — the month-end Faro Default Interest accrual, maker <> checker (interest-accrual.service.ts).
//   GET  /api/v1/factoring/interest-accrual/preview?operating_company_id=&period=YYYY-MM   computed lines, posts nothing
//   GET  /api/v1/factoring/interest-accrual/runs?operating_company_id=                     proposed / posted / rejected runs
//   GET  /api/v1/factoring/interest-accrual/ties?operating_company_id=                     2150 vs open Net Amount
//   POST /api/v1/factoring/interest-accrual/propose  { operating_company_id, period }          maker — posts nothing
//   POST /api/v1/factoring/interest-accrual/runs/:id/decide { operating_company_id, decision, note? }  a different user
// Owner / Administrator / Accountant — the month-close roles.
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import {
  INTEREST_ACCRUAL_ROLES,
  InterestAccrualError,
  advanceLiabilityTiesToOpenNet,
  decideInterestAccrual,
  listInterestAccrualRuns,
  previewInterestAccrual,
  proposeInterestAccrual,
} from "./interest-accrual.service.js";

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const companyQ = z.object({ operating_company_id: z.string().uuid() });
const previewQ = companyQ.extend({ period });
const proposeBody = companyQ.extend({ period });
const decideParams = z.object({ id: z.string().uuid() });
const decideBody = companyQ.extend({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).nullish() });

const STATUS: Record<string, number> = {
  interest_accrual_run_not_found: 404,
  invalid_period: 400,
};

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof InterestAccrualError) return reply.code(STATUS[err.code] ?? 409).send({ error: err.code });
  throw err;
}

export async function registerInterestAccrualRoutes(app: FastifyInstance) {
  const closer = (req: Parameters<typeof currentAuthUser>[0], reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return null;
    if (!INTEREST_ACCRUAL_ROLES.has(String(user.role ?? ""))) {
      reply.code(403).send({ error: "interest_accrual_restricted" });
      return null;
    }
    return user;
  };
  const rl = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  app.get("/api/v1/factoring/interest-accrual/preview", rl, async (req, reply) => {
    const user = closer(req, reply);
    if (!user) return;
    const p = previewQ.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    try {
      return await withCompanyScope(user.uuid, p.data.operating_company_id, (c) => previewInterestAccrual(c, p.data.operating_company_id, p.data.period));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/api/v1/factoring/interest-accrual/runs", rl, async (req, reply) => {
    const user = closer(req, reply);
    if (!user) return;
    const p = companyQ.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    const rows = await withCompanyScope(user.uuid, p.data.operating_company_id, (c) => listInterestAccrualRuns(c, p.data.operating_company_id));
    return { rows };
  });

  app.get("/api/v1/factoring/interest-accrual/ties", rl, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = companyQ.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    return withCompanyScope(user.uuid, p.data.operating_company_id, (c) => advanceLiabilityTiesToOpenNet(c, p.data.operating_company_id));
  });

  app.post("/api/v1/factoring/interest-accrual/propose", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = closer(req, reply);
    if (!user) return;
    const b = proposeBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        proposeInterestAccrual(c, { operating_company_id: b.data.operating_company_id, period: b.data.period, actor_user_id: user.uuid })
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/api/v1/factoring/interest-accrual/runs/:id/decide", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = closer(req, reply);
    if (!user) return;
    const params = decideParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const b = decideBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        decideInterestAccrual(c, {
          operating_company_id: b.data.operating_company_id,
          run_id: params.data.id,
          decision: b.data.decision,
          note: b.data.note ?? null,
          actor_user_id: user.uuid,
          actor_role: String(user.role ?? ""),
        })
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
