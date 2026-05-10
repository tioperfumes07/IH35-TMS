import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  listPaymentEvents,
  markBounced,
  markCleared,
  markPaidManually,
  markSentToBank,
  queuePayment,
} from "./settlement-payment.service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const markSentBodySchema = z.object({ bank_reference: z.string().trim().min(1).max(200) });
const bouncedBodySchema = z.object({ reason: z.string().trim().min(3).max(500) });
const markManualBodySchema = z.object({
  payment_method: z.string().trim().min(2).max(60),
  reference: z.string().trim().max(200).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOwnerAdminAccountant(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

function mapServiceError(error: unknown, reply: FastifyReply) {
  const message = String((error as Error)?.message ?? "unknown_error");
  if (message === "settlement_not_found") return reply.code(404).send({ error: message });
  if (message === "driver_bank_configuration_required") return reply.code(409).send({ error: message });
  if (message === "settlement_must_be_final") return reply.code(409).send({ error: message });
  if (message === "invalid_payment_state_transition") return reply.code(409).send({ error: message });
  return reply.code(500).send({ error: "settlement_payment_operation_failed", message });
}

export async function registerSettlementPaymentRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver-pay/settlements/:id/queue-payment", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    try {
      const settlement = await queuePayment(params.data.id, user.uuid);
      return { settlement };
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  app.post("/api/v1/driver-pay/settlements/:id/mark-sent", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = markSentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const settlement = await markSentToBank(params.data.id, body.data.bank_reference, user.uuid);
      return { settlement };
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  app.post("/api/v1/driver-pay/settlements/:id/mark-cleared", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    try {
      const settlement = await markCleared(params.data.id, user.uuid);
      return { settlement };
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  app.post("/api/v1/driver-pay/settlements/:id/mark-bounced", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = bouncedBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const settlement = await markBounced(params.data.id, body.data.reason, user.uuid);
      return { settlement };
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  app.post("/api/v1/driver-pay/settlements/:id/mark-paid-manually", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = markManualBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const settlement = await markPaidManually(params.data.id, body.data.payment_method, body.data.reference ?? null, user.uuid);
      return { settlement };
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  app.get("/api/v1/driver-pay/settlements/:id/payment-events", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const events = await listPaymentEvents(params.data.id, query.data.operating_company_id, user.uuid);
    return { events };
  });
}

