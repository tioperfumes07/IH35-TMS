import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  FEE_APPLICATION_MODES,
  TierValidationError,
  validateFeeApplicationMode,
  validateFeeSchedule,
  validateReserveSchedule,
} from "./factor-tier-validator.js";
import {
  assignCustomerToFactor,
  createFactor,
  deactivateFactor,
  FactorServiceError,
  getFactorForCustomer,
  listFactorAssignmentsForCustomer,
  listFactorBatchHistoryForCustomer,
  listFactors,
  updateFactor,
} from "./factor.service.js";

const FEE_APP_MODES = ["replace", "segmented", "additive"] as const;

// ── Shared tier schemas ───────────────────────────────────────────────────────
const feeTierSchema = z.object({
  from_day: z.number().int().min(0),
  to_day: z.number().int().positive().nullable(),
  fee_rate: z.number().min(0).max(1),
});

const reserveTierSchema = z.object({
  from_day: z.number().int().min(0),
  to_day: z.number().int().positive().nullable(),
  reserve_rate: z.number().min(0).max(1),
});

// ── Param / query / body schemas ──────────────────────────────────────────────
const factorParamsSchema = z.object({
  id: z.string().uuid(),
});

const customerParamsSchema = z.object({
  customerId: z.string().uuid(),
});

const listFactorsQuerySchema = companyQuerySchema.extend({
  active_only: z.coerce.boolean().optional(),
});

const createFactorBodySchema = companyQuerySchema.extend({
  name: z.string().trim().min(1),
  advance_rate: z.coerce.number().min(0).max(1),
  fee_rate: z.coerce.number().min(0).max(1),
  reserve_rate: z.coerce.number().min(0).max(1),
  recourse_days: z.coerce.number().int().min(1),
  active: z.boolean().optional(),
  // Tiered schedules — optional; when absent the flat rate above is the fallback
  fee_schedule: z.array(feeTierSchema).optional().nullable(),
  reserve_schedule: z.array(reserveTierSchema).optional().nullable(),
  fee_application_mode: z.enum(FEE_APP_MODES).optional(),
  remittance_details: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const patchFactorBodySchema = companyQuerySchema.extend({
  name: z.string().trim().min(1).optional(),
  advance_rate: z.coerce.number().min(0).max(1).optional(),
  fee_rate: z.coerce.number().min(0).max(1).optional(),
  reserve_rate: z.coerce.number().min(0).max(1).optional(),
  recourse_days: z.coerce.number().int().min(1).optional(),
  active: z.boolean().optional(),
  fee_schedule: z.array(feeTierSchema).optional().nullable(),
  reserve_schedule: z.array(reserveTierSchema).optional().nullable(),
  fee_application_mode: z.enum(FEE_APP_MODES).optional(),
  remittance_details: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const customerFactorQuerySchema = companyQuerySchema.extend({
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const assignCustomerFactorBodySchema = companyQuerySchema.extend({
  factor_id: z.string().uuid(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// MUST KEEP: role-gating — 403 for any role not in this list
function canMutate(role: string) {
  const normalized = String(role || "").toLowerCase();
  return ["owner", "administrator", "manager", "accountant", "dispatcher"].includes(normalized);
}

type ReplyLike = { code: (status: number) => { send: (payload: unknown) => void } };

function sendFactorError(reply: ReplyLike, error: unknown): boolean {
  if (error instanceof TierValidationError) {
    reply.code(422).send({ error: "tier_validation_error", field: error.field, message: error.message });
    return true;
  }
  if (error instanceof FactorServiceError) {
    reply.code(error.statusCode).send({ error: error.code });
    return true;
  }
  return false;
}

// Validates tier fields before any DB write. Returns false and sends response if invalid.
function validateTiers(
  data: { fee_schedule?: unknown[] | null; reserve_schedule?: unknown[] | null; fee_application_mode?: string },
  reply: ReplyLike
): boolean {
  try {
    if (data.fee_schedule != null) validateFeeSchedule(data.fee_schedule);
    if (data.reserve_schedule != null) validateReserveSchedule(data.reserve_schedule);
    if (data.fee_application_mode != null) validateFeeApplicationMode(data.fee_application_mode);
    return true;
  } catch (err) {
    sendFactorError(reply, err);
    return false;
  }
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// ── Routes ────────────────────────────────────────────────────────────────────
export async function registerFactorRoutes(app: FastifyInstance) {

  // GET /api/v1/factoring/factors — list all factors for tenant
  app.get("/api/v1/factoring/factors", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = listFactorsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // MUST KEEP: company-scope
    const factors = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listFactors(query.data.operating_company_id, { activeOnly: query.data.active_only }, { client })
    );

    return { factors };
  });

  // POST /api/v1/factoring/factors — create factor profile
  app.post("/api/v1/factoring/factors", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" }); // MUST KEEP: role-gate

    const body = createFactorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    // MUST ADD: validate tier contiguity + mode enum before any write
    if (!validateTiers(body.data, reply)) return;

    try {
      const factor = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => { // MUST KEEP: company-scope
        const created = await createFactor(
          body.data.operating_company_id,
          {
            name: body.data.name,
            advance_rate: body.data.advance_rate,
            fee_rate: body.data.fee_rate,
            reserve_rate: body.data.reserve_rate,
            recourse_days: body.data.recourse_days,
            active: body.data.active,
            fee_schedule: body.data.fee_schedule ?? null,
            reserve_schedule: body.data.reserve_schedule ?? null,
            fee_application_mode: body.data.fee_application_mode,
            remittance_details: body.data.remittance_details ?? null,
            notes: body.data.notes ?? null,
          },
          { client }
        );
        // MUST KEEP: spine audit on create
        await appendCrudAudit(client, user.uuid, "factoring.factor.created", {
          resource_type: "factoring.factor",
          resource_id: created.id,
          operating_company_id: body.data.operating_company_id,
          name: body.data.name,
          fee_application_mode: created.fee_application_mode,
          has_fee_schedule: created.fee_schedule != null,
          has_reserve_schedule: created.reserve_schedule != null,
        }, "info", "C2-FACTORING-PROFILE");
        return created;
      });
      return reply.code(201).send(factor);
    } catch (error) {
      if (sendFactorError(reply, error)) return;
      throw error;
    }
  });

  // PATCH /api/v1/factoring/factors/:id — update factor profile
  app.patch("/api/v1/factoring/factors/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" }); // MUST KEEP: role-gate

    const params = factorParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = patchFactorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    // MUST ADD: validate tier contiguity + mode enum before any write
    if (!validateTiers(body.data, reply)) return;

    try {
      const factor = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => { // MUST KEEP: company-scope
        const patch: Parameters<typeof updateFactor>[2] = {
          name: body.data.name,
          advance_rate: body.data.advance_rate,
          fee_rate: body.data.fee_rate,
          reserve_rate: body.data.reserve_rate,
          recourse_days: body.data.recourse_days,
          active: body.data.active,
          fee_application_mode: body.data.fee_application_mode,
        };
        // Only set schedule fields if they were explicitly sent in the request body
        if (Object.prototype.hasOwnProperty.call(body.data, "fee_schedule")) {
          patch.fee_schedule = body.data.fee_schedule ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(body.data, "reserve_schedule")) {
          patch.reserve_schedule = body.data.reserve_schedule ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(body.data, "remittance_details")) {
          patch.remittance_details = body.data.remittance_details ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(body.data, "notes")) {
          patch.notes = body.data.notes ?? null;
        }
        const updated = await updateFactor(body.data.operating_company_id, params.data.id, patch, { client });
        // MUST KEEP: spine audit on update
        await appendCrudAudit(client, user.uuid, "factoring.factor.updated", {
          resource_type: "factoring.factor",
          resource_id: params.data.id,
          operating_company_id: body.data.operating_company_id,
          fee_application_mode: updated.fee_application_mode,
        }, "info", "C2-FACTORING-PROFILE");
        return updated;
      });
      return factor;
    } catch (error) {
      if (sendFactorError(reply, error)) return;
      throw error;
    }
  });

  // DELETE /api/v1/factoring/factors/:id — SOFT deactivate (NOT hard delete)
  app.delete("/api/v1/factoring/factors/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" }); // MUST KEEP: role-gate

    const params = factorParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      // MUST KEEP: soft-delete only — deactivateFactor sets active=false, no row removed
      const factor = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => { // MUST KEEP: company-scope
        const deactivated = await deactivateFactor(query.data.operating_company_id, params.data.id, { client });
        // MUST KEEP: spine audit on deactivate
        await appendCrudAudit(client, user.uuid, "factoring.factor.deactivated", {
          resource_type: "factoring.factor",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        }, "info", "C2-FACTORING-PROFILE");
        return deactivated;
      });
      return factor;
    } catch (error) {
      if (sendFactorError(reply, error)) return;
      throw error;
    }
  });

  // GET /api/v1/customers/:customerId/factor — active factor for a customer
  app.get("/api/v1/customers/:customerId/factor", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = customerParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = customerFactorQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOfDate = query.data.as_of_date ?? todayDateString();

    // MUST KEEP: company-scope
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const factor = await getFactorForCustomer(query.data.operating_company_id, params.data.customerId, asOfDate, { client });
      const assignments = await listFactorAssignmentsForCustomer(query.data.operating_company_id, params.data.customerId, { client });
      const batches = await listFactorBatchHistoryForCustomer(query.data.operating_company_id, params.data.customerId, { client });
      return { factor, assignments, batches, as_of_date: asOfDate };
    });

    return payload;
  });

  // POST /api/v1/customers/:customerId/factor — assign customer to factor
  app.post("/api/v1/customers/:customerId/factor", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" }); // MUST KEEP: role-gate

    const params = customerParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = assignCustomerFactorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      // MUST KEEP: company-scope
      const assignment = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const created = await assignCustomerToFactor(
          body.data.operating_company_id,
          params.data.customerId,
          body.data.factor_id,
          body.data.effective_from,
          { client }
        );
        // MUST KEEP: spine audit on customer assignment
        await appendCrudAudit(client, user.uuid, "factoring.customer_assignment.created", {
          resource_type: "factoring.customer_factor_assignment",
          resource_id: created.id,
          operating_company_id: body.data.operating_company_id,
          customer_id: params.data.customerId,
          factor_id: body.data.factor_id,
        }, "info", "C2-FACTORING-PROFILE");
        return created;
      });
      return reply.code(201).send(assignment);
    } catch (error) {
      if (sendFactorError(reply, error)) return;
      throw error;
    }
  });
}
