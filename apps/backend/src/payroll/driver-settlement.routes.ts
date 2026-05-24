import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../accounting/shared.js";
import { computeSettlement, postSettlement } from "./driver-settlement.service.js";

const computeBodySchema = z.object({
  driver_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bank_settle_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const postParamsSchema = z.object({
  settlement_id: z.string().uuid(),
});

const postBodySchema = z.object({
  payment_method: z.enum(["check", "ach", "wire", "cash", "credit_card"]).optional(),
});

export async function registerPayrollDriverSettlementRoutes(app: FastifyInstance) {
  app.post("/api/v1/payroll/driver-settlements/compute", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = computeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const payload = await computeSettlement(
        {
          operatingCompanyId: query.data.operating_company_id,
          driverId: body.data.driver_id,
          periodStart: body.data.period_start,
          periodEnd: body.data.period_end,
          bankSettleDate: body.data.bank_settle_date ?? null,
        },
        user.uuid
      );
      return reply.code(201).send(payload);
    } catch (error) {
      const message = String((error as Error)?.message ?? "driver_settlement_compute_failed");
      if (message.includes("COA_ROLE_MAPPING_NOT_FOUND")) return reply.code(409).send({ error: "coa_role_mapping_missing" });
      return reply.code(500).send({ error: message });
    }
  });

  app.post("/api/v1/payroll/driver-settlements/:settlement_id/post", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = postParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = postBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const payload = await postSettlement(
        {
          settlementId: params.data.settlement_id,
          operatingCompanyId: query.data.operating_company_id,
          paymentMethod: body.data.payment_method,
        },
        user.uuid
      );
      return reply.code(200).send(payload);
    } catch (error) {
      const message = String((error as Error)?.message ?? "driver_settlement_post_failed");
      if (message === "driver_settlement_not_found") return reply.code(404).send({ error: message });
      if (message === "driver_settlement_must_be_draft") return reply.code(409).send({ error: message });
      if (message === "driver_settlement_net_non_positive") return reply.code(409).send({ error: message });
      if (message === "driver_vendor_missing") return reply.code(409).send({ error: message });
      return reply.code(500).send({ error: message });
    }
  });
}
