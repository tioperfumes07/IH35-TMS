import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
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
});

const patchFactorBodySchema = companyQuerySchema.extend({
  name: z.string().trim().min(1).optional(),
  advance_rate: z.coerce.number().min(0).max(1).optional(),
  fee_rate: z.coerce.number().min(0).max(1).optional(),
  reserve_rate: z.coerce.number().min(0).max(1).optional(),
  recourse_days: z.coerce.number().int().min(1).optional(),
  active: z.boolean().optional(),
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

function canMutate(role: string) {
  const normalized = String(role || "").toLowerCase();
  return ["owner", "administrator", "manager", "accountant", "dispatcher"].includes(normalized);
}

function sendFactorError(reply: { code: (status: number) => { send: (payload: unknown) => void } }, error: unknown) {
  if (!(error instanceof FactorServiceError)) return false;
  return reply.code(error.statusCode).send({ error: error.code });
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerFactorRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/factors", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = listFactorsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const factors = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listFactors(query.data.operating_company_id, { activeOnly: query.data.active_only }, { client })
    );

    return { factors };
  });

  app.post("/api/v1/factoring/factors", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = createFactorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const factor = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const created = await createFactor(
          body.data.operating_company_id,
          {
            name: body.data.name,
            advance_rate: body.data.advance_rate,
            fee_rate: body.data.fee_rate,
            reserve_rate: body.data.reserve_rate,
            recourse_days: body.data.recourse_days,
            active: body.data.active,
          },
          { client }
        );
        await appendCrudAudit(client, user.uuid, "factoring.factor.created", {
          resource_type: "factoring.factor",
          resource_id: created.id,
          operating_company_id: body.data.operating_company_id,
          name: body.data.name,
        }, "info", "C2-FACTORING-PROFILE");
        return created;
      });
      return reply.code(201).send(factor);
    } catch (error) {
      if (sendFactorError(reply, error)) return;
      throw error;
    }
  });

  app.patch("/api/v1/factoring/factors/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = factorParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = patchFactorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const factor = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const updated = await updateFactor(
          body.data.operating_company_id,
          params.data.id,
          {
            name: body.data.name,
            advance_rate: body.data.advance_rate,
            fee_rate: body.data.fee_rate,
            reserve_rate: body.data.reserve_rate,
            recourse_days: body.data.recourse_days,
            active: body.data.active,
          },
          { client }
        );
        await appendCrudAudit(client, user.uuid, "factoring.factor.updated", {
          resource_type: "factoring.factor",
          resource_id: params.data.id,
          operating_company_id: body.data.operating_company_id,
        }, "info", "C2-FACTORING-PROFILE");
        return updated;
      });
      return factor;
    } catch (error) {
      if (sendFactorError(reply, error)) return;
      throw error;
    }
  });

  app.delete("/api/v1/factoring/factors/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = factorParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const factor = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const deactivated = await deactivateFactor(query.data.operating_company_id, params.data.id, { client });
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

  app.get("/api/v1/customers/:customerId/factor", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = customerParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = customerFactorQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOfDate = query.data.as_of_date ?? todayDateString();

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const factor = await getFactorForCustomer(query.data.operating_company_id, params.data.customerId, asOfDate, { client });
      const assignments = await listFactorAssignmentsForCustomer(query.data.operating_company_id, params.data.customerId, { client });
      const batches = await listFactorBatchHistoryForCustomer(query.data.operating_company_id, params.data.customerId, { client });
      return { factor, assignments, batches, as_of_date: asOfDate };
    });

    return payload;
  });

  app.post("/api/v1/customers/:customerId/factor", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = customerParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = assignCustomerFactorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const assignment = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const created = await assignCustomerToFactor(
          body.data.operating_company_id,
          params.data.customerId,
          body.data.factor_id,
          body.data.effective_from,
          { client }
        );
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
