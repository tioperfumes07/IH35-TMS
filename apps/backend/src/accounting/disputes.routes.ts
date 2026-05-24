import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  decideSettlementDisputeP6,
  listSettlementDisputeQueueP6,
  listSettlementDisputesForSettlementOfficeP6,
  startSettlementDisputeReviewP6,
} from "../driver-finance/settlement-disputes-p6.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const disputeIdParamsSchema = z.object({ disputeId: z.string().uuid() });
const settlementIdParamsSchema = z.object({ settlementId: z.string().uuid() });

const queueQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.string().trim().min(1).optional(),
  driver_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const decideBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  decision: z.enum(["approved", "denied"]),
  resolution_text: z.string().trim().min(10),
  adjustment_cents: z.number().int().positive().optional(),
});

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapError(error: unknown) {
  const msg = String((error as Error)?.message ?? "unknown_error");
  if (msg.includes("E_NOT_FOUND")) return { code: 404 as const, error: "not_found" };
  if (msg.includes("E_START_REVIEW_INVALID_STATE")) return { code: 409 as const, error: "invalid_status_for_start_review" };
  if (msg.includes("E_DECIDE_REQUIRES_UNDER_REVIEW")) return { code: 409 as const, error: "decide_requires_under_review" };
  if (msg.includes("E_ADJUSTMENT_REQUIRED")) return { code: 400 as const, error: "adjustment_required" };
  if (msg.includes("E_RESOLUTION_TEXT_REQUIRED")) return { code: 400 as const, error: "resolution_text_required" };
  if (msg.includes("E_CORRECTIVE_JE_ACCOUNTS_MISSING")) return { code: 409 as const, error: "E_CORRECTIVE_JE_ACCOUNTS_MISSING" };
  return { code: 500 as const, error: "dispute_operation_failed", message: msg };
}

const OFFICE_READ_ROLES = new Set(["Owner", "Administrator", "Accountant", "Manager", "Dispatcher"]);
const DECIDE_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

export async function registerAccountingSettlementDisputesP6Routes(app: FastifyInstance) {
  app.get("/api/v1/settlements/:settlementId/disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = settlementIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    if (!OFFICE_READ_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    try {
      const disputes = await listSettlementDisputesForSettlementOfficeP6(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        settlement_id: params.data.settlementId,
      });
      return { disputes };
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.get("/api/v1/disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const query = queueQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    if (!OFFICE_READ_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    try {
      const payload = await listSettlementDisputeQueueP6(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        status: query.data.status ?? null,
        driver_id: query.data.driver_id ?? null,
        limit: query.data.limit,
        offset: query.data.offset,
      });
      return { disputes: payload.rows, total: payload.total, limit: query.data.limit, offset: query.data.offset };
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.post("/api/v1/disputes/:disputeId/start-review", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = disputeIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    if (!DECIDE_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    try {
      const result = await startSettlementDisputeReviewP6(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        dispute_id: params.data.disputeId,
      });
      return result;
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.post("/api/v1/disputes/:disputeId/decide", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = disputeIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = decideBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (!DECIDE_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    try {
      const result = await decideSettlementDisputeP6(user.uuid, String(user.role ?? ""), {
        operating_company_id: body.data.operating_company_id,
        dispute_id: params.data.disputeId,
        decision: body.data.decision,
        resolution_text: body.data.resolution_text,
        adjustment_cents: body.data.adjustment_cents ?? null,
      });
      return result;
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });
}


export default fp(async (app) => {
  await registerAccountingSettlementDisputesP6Routes(app);
}, { name: "accounting.registerAccountingSettlementDisputesP6Routes" });
