import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  createDriverPaymentMethod,
  listDriverPaymentMethods,
  setDefaultDriverPaymentMethod,
  voidDriverPaymentMethod,
} from "./driver-payment-methods.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ driverId: z.string().uuid() });
const idParamsSchema = z.object({ id: z.string().uuid() });

const last4 = z.string().regex(/^[0-9]{4}$/).nullable().optional();
const createBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    method: z.enum(["ach", "check"]),
    account_token: z.string().trim().min(1).max(200).nullable().optional(),
    routing_last4: last4,
    account_last4: last4,
    account_holder_name: z.string().trim().max(120).nullable().optional(),
    make_default: z.boolean().optional().default(false),
  })
  .refine((b) => b.method !== "ach" || Boolean(b.account_token), {
    message: "ach_requires_account_token",
    path: ["account_token"],
  });

const listQuerySchema = companyQuerySchema.extend({
  include_inactive: z.coerce.boolean().optional().default(false),
});
const voidBodySchema = companyQuerySchema.extend({ reason: z.string().trim().min(3).max(500) });
const defaultBodySchema = companyQuerySchema;

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

// Payment-method master data is money-adjacent config → writes are Owner/Administrator only.
function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}
function canRead(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function mapServiceError(error: unknown, reply: FastifyReply) {
  const message = String((error as { message?: string })?.message ?? "unknown_error");
  if (message === "driver_payment_method_not_found") return reply.code(404).send({ error: message });
  if (message === "ach_requires_account_token") return reply.code(400).send({ error: message });
  if (message === "void_reason_required") return reply.code(400).send({ error: message });
  throw error;
}

export async function registerDriverPaymentMethodRoutes(app: FastifyInstance) {
  // List a driver's payment methods.
  app.get("/api/v1/driver-finance/drivers/:driverId/payment-methods", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canRead(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const rows = await listDriverPaymentMethods(user.uuid, query.data.operating_company_id, params.data.driverId, {
      includeInactive: query.data.include_inactive,
    });
    return { payment_methods: rows };
  });

  // Create a payment method for a driver.
  app.post("/api/v1/driver-finance/drivers/:driverId/payment-methods", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const created = await createDriverPaymentMethod(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        driverId: params.data.driverId,
        method: body.data.method,
        accountToken: body.data.account_token ?? null,
        routingLast4: body.data.routing_last4 ?? null,
        accountLast4: body.data.account_last4 ?? null,
        accountHolderName: body.data.account_holder_name ?? null,
        makeDefault: body.data.make_default,
      });
      return reply.code(201).send(created);
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  // Set a method as the driver's default (unsets any prior default in the same transaction).
  app.patch("/api/v1/driver-finance/driver-payment-methods/:id/default", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = defaultBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const updated = await setDefaultDriverPaymentMethod(user.uuid, body.data.operating_company_id, params.data.id);
      return updated;
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });

  // Void (soft-delete) a payment method.
  app.patch("/api/v1/driver-finance/driver-payment-methods/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const voided = await voidDriverPaymentMethod(user.uuid, body.data.operating_company_id, params.data.id, body.data.reason);
      return voided;
    } catch (error) {
      return mapServiceError(error, reply);
    }
  });
}
