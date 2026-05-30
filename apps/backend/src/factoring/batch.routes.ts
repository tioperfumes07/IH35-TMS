import type { FastifyInstance } from "fastify";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import {
  factoringBatchCompanyQuerySchema,
  factoringBatchCreateBodySchema,
  factoringBatchIdParamsSchema,
  factoringBatchListQuerySchema,
  factoringBatchSubmitQuerySchema,
} from "./batch.shared.js";
import {
  createDraftBatch,
  FactoringBatchError,
  getBatchDetail,
  listBatches,
  listCandidateInvoices,
  submitBatch,
} from "./batch.service.js";
import { listReserveMovementsForBatch } from "./reserve.service.js";

function canMutate(role: string) {
  const normalized = String(role || "").toLowerCase();
  return ["owner", "administrator", "manager", "accountant", "dispatcher"].includes(normalized);
}

function sendBatchError(reply: { code: (status: number) => { send: (payload: unknown) => void } }, error: unknown) {
  if (!(error instanceof FactoringBatchError)) return false;
  return reply.code(error.statusCode).send({
    error: error.code,
    ...(error.details ? { details: error.details } : {}),
  });
}

export async function registerFactoringBatchRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/batches/candidate-invoices", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = factoringBatchCompanyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const invoices = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listCandidateInvoices(query.data.operating_company_id, { client })
    );
    return { invoices };
  });

  app.get("/api/v1/factoring/batches", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = factoringBatchListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const batches = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listBatches(query.data.operating_company_id, { client, status: query.data.status })
    );
    return { batches };
  });

  app.post("/api/v1/factoring/batches", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = factoringBatchCreateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const batch = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
        createDraftBatch(body.data.operating_company_id, body.data.invoice_ids, { client })
      );
      return reply.code(201).send(batch);
    } catch (error) {
      if (sendBatchError(reply, error)) return;
      throw error;
    }
  });

  app.post("/api/v1/factoring/batches/:id/submit", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = factoringBatchIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = factoringBatchSubmitQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const batch = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        submitBatch(params.data.id, query.data.operating_company_id, { client })
      );
      return batch;
    } catch (error) {
      if (sendBatchError(reply, error)) return;
      throw error;
    }
  });

  app.get("/api/v1/factoring/batches/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = factoringBatchIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = factoringBatchCompanyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      getBatchDetail(params.data.id, query.data.operating_company_id, { client })
    );
    if (!detail) return reply.code(404).send({ error: "batch_not_found" });
    return detail;
  });

  app.get("/api/v1/factoring/batches/:id/reserve-movements", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = factoringBatchIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = factoringBatchCompanyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const movements = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listReserveMovementsForBatch(params.data.id, query.data.operating_company_id, { client })
    );
    return { movements };
  });
}

