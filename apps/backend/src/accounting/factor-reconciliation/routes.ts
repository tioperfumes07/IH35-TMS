import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { importStatement, listImportCandidates, listReconciliationItems, listReconciliationRuns } from "./recon.service.js";

const listRunsQuery = companyQuerySchema.extend({
  factor_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const listItemsQuery = companyQuerySchema;

const importBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  factor_id: z.string().uuid(),
  daily_import_id: z.string().uuid(),
});

const importCandidatesQuery = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const idParamSchema = z.object({
  run_id: z.string().uuid(),
});

function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

export async function registerFactorReconciliationRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/factor-reconciliation/import-candidates", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = importCandidatesQuery.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await listImportCandidates({
      operating_company_id: query.data.operating_company_id,
      limit: query.data.limit,
    });
    return { rows };
  });

  app.get("/api/v1/accounting/factor-reconciliation/runs", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = listRunsQuery.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await listReconciliationRuns({
      operating_company_id: query.data.operating_company_id,
      factor_id: query.data.factor_id,
      limit: query.data.limit,
    });
    return { rows };
  });

  app.get("/api/v1/accounting/factor-reconciliation/runs/:run_id/items", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listItemsQuery.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await listReconciliationItems({
      operating_company_id: query.data.operating_company_id,
      run_id: params.data.run_id,
    });
    return { rows };
  });

  app.post("/api/v1/accounting/factor-reconciliation/import", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = importBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const run = await importStatement({
      operating_company_id: body.data.operating_company_id,
      factor_id: body.data.factor_id,
      daily_import_id: body.data.daily_import_id,
      actor_user_uuid: user.uuid,
    });
    return reply.code(201).send({ run });
  });
}
