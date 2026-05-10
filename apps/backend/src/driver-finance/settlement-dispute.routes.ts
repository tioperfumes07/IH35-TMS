import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  getDispute,
  listDisputes,
  listMyDisputes,
  markUnderReview,
  openDispute,
  resolveDriverIdForUser,
  resolveDispute,
  withdrawDispute,
} from "./settlement-dispute.service.js";

const disputeCategorySchema = z.enum([
  "missing_pay",
  "wrong_deduction",
  "miscalculated_mileage",
  "wrong_rate",
  "detention_not_paid",
  "cash_advance_dispute",
  "fine_dispute",
  "escrow_dispute",
  "other",
]);

const createDisputeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  settlement_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  dispute_category: disputeCategorySchema,
  dispute_description: z.string().trim().min(20),
  disputed_amount_cents: z.number().int().positive().optional(),
});

const listDisputeQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["open", "all"]).default("open"),
  driver_id: z.string().uuid().optional(),
});

const operatingCompanyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  resolution: z.enum(["in_favor", "rejected", "partial"]),
  resolution_notes: z.string().trim().min(20),
  resolution_amount_cents: z.number().int().positive().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

function mapKnownError(error: unknown) {
  const msg = String((error as Error)?.message ?? "unknown_error");
  if (msg.includes("E_NOT_FOUND")) return { code: 404, error: "E_NOT_FOUND" };
  if (msg.includes("E_OWNER_OR_ADMIN_ONLY")) return { code: 403, error: "E_OWNER_OR_ADMIN_ONLY" };
  if (msg.includes("E_FORBIDDEN_NOT_DRIVER")) return { code: 403, error: "E_FORBIDDEN_NOT_DRIVER" };
  if (msg.includes("E_CLOSED_IMMUTABLE")) return { code: 409, error: "E_CLOSED_IMMUTABLE" };
  if (msg.includes("E_RESOLUTION_NOTES_REQUIRED")) return { code: 400, error: "E_RESOLUTION_NOTES_REQUIRED" };
  if (msg.includes("E_DESCRIPTION_REQUIRED")) return { code: 400, error: "E_DESCRIPTION_REQUIRED" };
  if (msg.includes("E_SETTLEMENT_NOT_FOUND_FOR_DRIVER")) return { code: 404, error: "E_SETTLEMENT_NOT_FOUND_FOR_DRIVER" };
  if (msg.includes("E_RESOLUTION_AMOUNT_REQUIRED")) return { code: 400, error: "E_RESOLUTION_AMOUNT_REQUIRED" };
  if (msg.includes("E_CORRECTIVE_JE_ACCOUNTS_MISSING")) return { code: 409, error: "E_CORRECTIVE_JE_ACCOUNTS_MISSING" };
  if (msg.includes("E_DRIVER_PROFILE_NOT_FOUND")) return { code: 404, error: "E_DRIVER_PROFILE_NOT_FOUND" };
  return { code: 500, error: "settlement_dispute_operation_failed", message: msg };
}

export async function registerSettlementDisputeRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver-finance/settlement-disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const body = createDisputeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await openDispute(user.uuid, {
        ...body.data,
        opened_by_driver: user.role === "Driver",
      });
      return reply.code(201).send({ data });
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/v1/driver-finance/settlement-disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const query = listDisputeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const disputes = await listDisputes(user.uuid, query.data);
      return { disputes };
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/v1/driver-finance/settlement-disputes/:id", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = operatingCompanyBodySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const dispute = await getDispute(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        dispute_id: params.data.id,
      });
      if (!dispute) return reply.code(404).send({ error: "E_NOT_FOUND" });
      return { dispute };
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.post("/api/v1/driver-finance/settlement-disputes/:id/review", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "E_OWNER_OR_ADMIN_ONLY" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = operatingCompanyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await markUnderReview(user.uuid, user.role, {
        operating_company_id: body.data.operating_company_id,
        dispute_id: params.data.id,
      });
      return { data };
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.post("/api/v1/driver-finance/settlement-disputes/:id/resolve", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "E_OWNER_OR_ADMIN_ONLY" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await resolveDispute(user.uuid, user.role, {
        operating_company_id: body.data.operating_company_id,
        dispute_id: params.data.id,
        resolution: body.data.resolution,
        resolution_notes: body.data.resolution_notes,
        resolution_amount_cents: body.data.resolution_amount_cents,
      });
      return { data };
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.post("/api/v1/driver-finance/settlement-disputes/:id/withdraw", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = operatingCompanyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (user.role !== "Driver") return reply.code(403).send({ error: "E_DRIVER_ONLY_WITHDRAW" });
    try {
      const driverId = await resolveDriverIdForUser(user.uuid);
      if (!driverId) return reply.code(404).send({ error: "E_DRIVER_PROFILE_NOT_FOUND" });
      const data = await withdrawDispute(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        dispute_id: params.data.id,
        driver_id: driverId,
      });
      return { data };
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/v1/driver-pwa/my-disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (user.role !== "Driver") return reply.code(403).send({ error: "drivers_only" });
    try {
      const data = await listMyDisputes(user.uuid);
      return data;
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });
}
