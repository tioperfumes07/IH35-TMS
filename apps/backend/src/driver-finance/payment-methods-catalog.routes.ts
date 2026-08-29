import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  createPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
  voidPaymentMethod,
} from "./payment-methods-catalog.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const idParamsSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = companyQuerySchema.extend({ include_inactive: z.coerce.boolean().optional().default(false) });
const createBodySchema = companyQuerySchema.extend({
  name: z.string().trim().min(1).max(120),
  gl_account_id: z.string().uuid().nullable().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
});
const updateBodySchema = companyQuerySchema.extend({
  name: z.string().trim().min(1).max(120).optional(),
  gl_account_id: z.string().uuid().nullable().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});
const voidBodySchema = companyQuerySchema.extend({ reason: z.string().trim().min(3).max(500) });

// Owner/Administrator may WRITE the catalog; everyone authenticated may READ it (pickers need it).
const WRITE_ROLES = new Set(["Owner", "Administrator"]);

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}
function requireWriter(reply: FastifyReply, role: string): boolean {
  if (!WRITE_ROLES.has(role)) {
    reply.code(403).send({ error: "payment_method_catalog_write_forbidden" });
    return false;
  }
  return true;
}
function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

// Rate limits: reads 120/min, writes 30/min (fastify limiter is { global: false } — each route opts in).
const READ_RL = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
const WRITE_RL = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

export function registerPaymentMethodsCatalogRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/payment-methods", READ_RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = listQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(String(user.uuid), q.data.operating_company_id);
    return listPaymentMethods(user.uuid, q.data.operating_company_id, { includeInactive: q.data.include_inactive });
  });

  app.post("/api/v1/catalogs/payment-methods", WRITE_RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireWriter(reply, String(user.role ?? ""))) return;
    const b = createBodySchema.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    await assertCompanyMembership(String(user.uuid), b.data.operating_company_id);
    try {
      const created = await createPaymentMethod(user.uuid, b.data.operating_company_id, {
        name: b.data.name,
        gl_account_id: b.data.gl_account_id ?? null,
        sort_order: b.data.sort_order,
      });
      return reply.code(201).send(created);
    } catch (err) {
      const msg = String((err as Error)?.message ?? "");
      if (/uq_payment_methods_company_lower_name|duplicate key/i.test(msg)) {
        return reply.code(409).send({ error: "payment_method_name_exists" });
      }
      throw err;
    }
  });

  app.patch("/api/v1/catalogs/payment-methods/:id", WRITE_RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireWriter(reply, String(user.role ?? ""))) return;
    const p = idParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const b = updateBodySchema.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    await assertCompanyMembership(String(user.uuid), b.data.operating_company_id);
    const updated = await updatePaymentMethod(user.uuid, b.data.operating_company_id, p.data.id, {
      name: b.data.name,
      gl_account_id: b.data.gl_account_id,
      sort_order: b.data.sort_order,
      is_active: b.data.is_active,
    });
    if (!updated) return reply.code(404).send({ error: "payment_method_not_found" });
    return updated;
  });

  app.post("/api/v1/catalogs/payment-methods/:id/void", WRITE_RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireWriter(reply, String(user.role ?? ""))) return;
    const p = idParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const b = voidBodySchema.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    await assertCompanyMembership(String(user.uuid), b.data.operating_company_id);
    const voided = await voidPaymentMethod(user.uuid, b.data.operating_company_id, p.data.id, b.data.reason);
    if (!voided) return reply.code(404).send({ error: "payment_method_not_found" });
    return voided;
  });
}
