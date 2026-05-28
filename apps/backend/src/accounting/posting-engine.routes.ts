import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  PostingEngineError,
  postSourceTransaction,
  reversePostedSourceTransaction,
  runPostingEngineMvpBackfill,
  type PostingSourceType,
} from "./posting-engine.service.js";
import { enforcePsePostingOnBillPost } from "./pse-enforce.middleware.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

const postBodySchema = z.object({
  source_transaction_type: z.enum(["invoice", "bill", "customer_payment", "bill_payment"]),
  source_transaction_id: z.string().trim().min(1),
  source_transaction_line_id: z.string().trim().min(1).optional().nullable(),
  posting_purpose: z.enum(["initial_post", "reversal"]).optional(),
});

const reverseBodySchema = z.object({
  source_transaction_type: z.enum(["invoice", "bill", "customer_payment", "bill_payment"]),
  source_transaction_id: z.string().trim().min(1),
});

function mapPostingError(error: PostingEngineError) {
  if (error.code === "INVOICE_NOT_POSTING_ELIGIBLE" || error.code === "BILL_NOT_POSTING_ELIGIBLE" || error.code === "PAYMENT_NOT_POSTING_ELIGIBLE") {
    return { statusCode: 409, body: { error: error.code.toLowerCase(), message: error.message } };
  }
  if (error.code === "SOURCE_NOT_FOUND") {
    return { statusCode: 404, body: { error: error.code.toLowerCase(), message: error.message } };
  }
  if (error.code === "PERIOD_LOCKED") {
    return { statusCode: 423, body: { error: "period_locked", message: error.message } };
  }
  if (error.code === "UNBALANCED_ENTRY") {
    return { statusCode: 422, body: { error: "unbalanced_entry", message: error.message } };
  }
  if (error.code === "BILL_LINE_ACCOUNT_UNRESOLVED") {
    return { statusCode: 422, body: { error: "BILL_LINE_ACCOUNT_UNRESOLVED", message: error.message } };
  }
  if (error.code === "ACCOUNT_MAPPING_MISSING") {
    return { statusCode: 422, body: { error: "account_mapping_missing", message: error.message } };
  }
  return { statusCode: 400, body: { error: "posting_engine_error", message: error.message } };
}

function ensureFinanceUser(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

export async function registerPostingEngineRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/posting-engine-mvp/post", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = postBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const pseOk = await enforcePsePostingOnBillPost(req, reply);
    if (!pseOk) return;

    try {
      const result = await postSourceTransaction(
        {
          operating_company_id: query.data.operating_company_id,
          source_transaction_type: body.data.source_transaction_type,
          source_transaction_id: body.data.source_transaction_id,
          source_transaction_line_id: body.data.source_transaction_line_id ?? null,
          posting_purpose: body.data.posting_purpose,
        },
        { userId: user.uuid }
      );
      return reply.code(result.result === "already_posted" ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof PostingEngineError) {
        const mapped = mapPostingError(error);
        return reply.code(mapped.statusCode).send(mapped.body);
      }
      throw error;
    }
  });

  app.post("/api/v1/accounting/posting-engine-mvp/reverse", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = reverseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await reversePostedSourceTransaction(
        {
          operating_company_id: query.data.operating_company_id,
          source_transaction_type: body.data.source_transaction_type,
          source_transaction_id: body.data.source_transaction_id,
        },
        { userId: user.uuid }
      );
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof PostingEngineError) {
        const mapped = mapPostingError(error);
        return reply.code(mapped.statusCode).send(mapped.body);
      }
      throw error;
    }
  });

  app.post("/api/v1/accounting/posting-engine-mvp/backfill", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await runPostingEngineMvpBackfill(
      {
        operating_company_id: query.data.operating_company_id,
      },
      { userId: user.uuid }
    );
    return reply.code(200).send({
      mode: "one_time_backfill",
      source_types: ["invoice", "bill", "customer_payment", "bill_payment"] satisfies PostingSourceType[],
      ...result,
    });
  });
}


export default fp(async (app) => {
  await registerPostingEngineRoutes(app);
}, { name: "accounting.registerPostingEngineRoutes" });
