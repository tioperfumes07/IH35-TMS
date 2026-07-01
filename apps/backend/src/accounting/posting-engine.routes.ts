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
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

// CHAIN-06 GAP #1 kill switch (default OFF). Resolved PER-ENTITY via lib.feature_flags (isEnabled)
// INSIDE the request handler — NOT a global process.env read — so a flip is per-operating_company_id
// and turning invoice A/R posting on for one entity cannot enable it for another. Mirrors
// BILL_GL_POSTING_ENABLED (bill-gl-draft.routes.ts). Until this flag resolves true for the request's
// entity, invoice -> A/R posting via the generic MVP route (and the backfill sweep) is refused/no-op.
const INVOICE_AR_GL_POSTING_FLAG_KEY = "INVOICE_AR_GL_POSTING_ENABLED";

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

    // CHAIN-06 GAP #1 — kill switch for invoice -> A/R posting. This route posts invoice A/R with only
    // a role gate today; add the per-entity feature-flag gate so it cannot post to the books unless the
    // entity's INVOICE_AR_GL_POSTING_ENABLED override is ON. Only the invoice source is gated; bills and
    // payments keep their existing behavior. Reversal purpose is NOT gated (a posted entry must always be
    // reversible). When OFF -> 409 posting_disabled, nothing written (no-op).
    if (body.data.source_transaction_type === "invoice" && (body.data.posting_purpose ?? "initial_post") === "initial_post") {
      const invoiceArEnabled = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        isEnabled(client, INVOICE_AR_GL_POSTING_FLAG_KEY, {
          operating_company_id: query.data.operating_company_id,
          user_uuid: String(user.uuid),
        })
      );
      if (!invoiceArEnabled) {
        return reply.code(409).send({
          error: "posting_disabled",
          message:
            "Invoice→A/R posting is disabled for this entity (INVOICE_AR_GL_POSTING_ENABLED per-entity override OFF). Enable the per-entity override on a Neon branch to verify.",
        });
      }
    }

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

    // CHAIN-06 GAP #1 — the backfill sweep also posts invoice A/R, so it is the SAME kill switch: resolve
    // the per-entity flag and only let the sweep post invoices when it is ON for this entity. Bills and
    // payments continue to backfill unaffected.
    const invoiceArEnabled = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      isEnabled(client, INVOICE_AR_GL_POSTING_FLAG_KEY, {
        operating_company_id: query.data.operating_company_id,
        user_uuid: String(user.uuid),
      })
    );

    const result = await runPostingEngineMvpBackfill(
      {
        operating_company_id: query.data.operating_company_id,
        invoiceArPostingEnabled: invoiceArEnabled,
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
