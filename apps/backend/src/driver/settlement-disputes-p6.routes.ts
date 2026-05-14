import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireDriverSession } from "./auth.js";
import {
  listSettlementDisputesForSettlementDriverP6,
  submitSettlementDisputeP6,
  withdrawSettlementDisputeP6,
} from "../driver-finance/settlement-disputes-p6.service.js";

const settlementIdParamsSchema = z.object({ settlementId: z.string().uuid() });
const disputeIdParamsSchema = z.object({ disputeId: z.string().uuid() });

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const submitBodySchema = z.object({
  settlement_line_id: z.string().uuid().optional(),
  reason_code: z.string().trim().min(1).max(80),
  reason_text: z.string().trim().min(10).max(8000),
  claimed_adjustment_cents: z.number().int().optional(),
  evidence_r2_paths: z.array(z.string().trim().min(1)).max(25).optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapError(error: unknown) {
  const msg = String((error as Error)?.message ?? "unknown_error");
  if (msg.includes("E_SETTLEMENT_NOT_FOUND_FOR_DRIVER")) return { code: 404 as const, error: "settlement_not_found" };
  if (msg.includes("E_REASON_TEXT_REQUIRED")) return { code: 400 as const, error: "reason_text_required" };
  if (msg.includes("E_DISPUTE_WITHDRAW_FORBIDDEN_OR_CLOSED")) return { code: 409 as const, error: "withdraw_forbidden" };
  return { code: 500 as const, error: "driver_dispute_operation_failed", message: msg };
}

export async function registerDriverSettlementDisputesP6Routes(app: FastifyInstance) {
  app.post("/api/v1/driver/settlements/:settlementId/dispute", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const params = settlementIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = submitBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    try {
      const created = await submitSettlementDisputeP6(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        settlement_id: params.data.settlementId,
        driver_id: driver.id,
        settlement_line_id: body.data.settlement_line_id ?? null,
        reason_code: body.data.reason_code,
        reason_text: body.data.reason_text,
        claimed_adjustment_cents: body.data.claimed_adjustment_cents ?? null,
        evidence_r2_paths: body.data.evidence_r2_paths ?? null,
      });
      return reply.code(201).send(created);
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.get("/api/v1/driver/settlements/:settlementId/disputes", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const params = settlementIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    try {
      const disputes = await listSettlementDisputesForSettlementDriverP6(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        settlement_id: params.data.settlementId,
        driver_id: driver.id,
      });
      return { disputes };
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.patch("/api/v1/driver/disputes/:disputeId", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const params = disputeIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const bodySchema = z.object({ action: z.literal("withdraw") });
    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    try {
      const result = await withdrawSettlementDisputeP6(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        dispute_id: params.data.disputeId,
        driver_id: driver.id,
      });
      return result;
    } catch (error) {
      const mapped = mapError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });
}
