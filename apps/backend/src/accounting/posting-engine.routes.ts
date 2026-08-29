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
import { remediateRepointedBankLedgerPostings } from "../banking/bank-ledger-repoint-remediation.service.js";
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

// KILL-SWITCH PARITY — the generic posting-engine-mvp/post route can post ANY source type, so the
// per-entity kill switch must be identical regardless of entry point. Previously only 'invoice' was
// gated here; 'bill' / 'bill_payment' / 'customer_payment' posted with no entity-flag check (bypassing
// their dedicated route gates). Map each posting source type to its per-entity posting flag and enforce
// it on this route too. Each key is a POSTING_FLAG_KEY (per-entity gated, default OFF) — a global flip
// can never enable posting for every entity. 'reversal' is never gated (a posted entry must always be
// reversible).
export const POSTING_FLAG_BY_SOURCE_TYPE: Record<"invoice" | "bill" | "bill_payment" | "customer_payment", string> = {
  invoice: INVOICE_AR_GL_POSTING_FLAG_KEY,
  bill: "BILL_GL_POSTING_ENABLED",
  bill_payment: "BILL_PAYMENT_GL_POSTING_ENABLED",
  customer_payment: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
};

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

// dry_run defaults TRUE at the schema level: the caller must opt IN to writing corrections, so a
// request that forgets the field reports instead of posting.
const remediateRepointBodySchema = z.object({
  bank_account_id: z.string().uuid().optional().nullable(),
  dry_run: z.boolean().optional().default(true),
  limit: z.number().int().positive().max(2000).optional(),
});

function mapPostingError(error: PostingEngineError) {
  if (error.code === "INVOICE_NOT_POSTING_ELIGIBLE" || error.code === "BILL_NOT_POSTING_ELIGIBLE" || error.code === "PAYMENT_NOT_POSTING_ELIGIBLE" || error.code === "QBO_BILL_POST_GL_REFUSED" || error.code === "QBO_BILL_PAYMENT_POST_GL_REFUSED") {
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
  if (error.code === "INVOICE_LINE_REVENUE_UNRESOLVED") {
    return { statusCode: 422, body: { error: "invoice_line_revenue_unresolved", message: error.message } };
  }
  if (error.code === "INVOICE_LOAD_SOURCE_REQUIRED") {
    return { statusCode: 409, body: { error: "invoice_load_source_required", message: error.message } };
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
  app.post("/api/v1/accounting/posting-engine-mvp/post", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = postBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    // KILL-SWITCH PARITY — for every posting source type this route accepts, refuse to post to the books
    // unless the entity's matching per-entity posting flag is ON. Reversal purpose is NOT gated (a posted
    // entry must always be reversible). When OFF -> 409 posting_disabled, nothing written (no-op). This
    // makes the generic MVP route's kill switch identical to each type's dedicated route.
    if ((body.data.posting_purpose ?? "initial_post") === "initial_post") {
      const postingFlagKey = POSTING_FLAG_BY_SOURCE_TYPE[body.data.source_transaction_type];
      const postingEnabled = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        isEnabled(client, postingFlagKey, {
          operating_company_id: query.data.operating_company_id,
          user_uuid: String(user.uuid),
        })
      );
      if (!postingEnabled) {
        return reply.code(409).send({
          error: "posting_disabled",
          message: `${body.data.source_transaction_type}→GL posting is disabled for this entity (${postingFlagKey} per-entity override OFF). Enable the per-entity override on a Neon branch to verify.`,
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

  app.post("/api/v1/accounting/posting-engine-mvp/reverse", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = reverseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    // ACCT-F5567: another WRITE with no membership check — reversePostedSourceTransaction reverses a
    // REAL posted GL transaction, the same class of severity as ACCT-F5565's journal-entry void. The
    // sibling /post route in this file already asserts.
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

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

  app.post("/api/v1/accounting/posting-engine-mvp/backfill", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
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

  // Correct bank-feed postings written through a WRONG bank-leg bridge (see
  // bank-ledger-repoint-remediation.service.ts). Reverse + repost through the existing engine — no
  // hand-written journal entry. Flag-gated DEFAULT OFF and a strict no-op while the bridge is still
  // mismatched. `dry_run` is the default: correcting live ledger history is opt-in per call, never
  // something a stray POST does by accident.
  app.post(
    "/api/v1/accounting/posting-engine-mvp/remediate-bank-ledger-repoint",
    // Deliberately tight: each call can drive hundreds of reverse+repost pairs against posted ledger
    // history. CodeQL (js/missing-rate-limiting) flags the authorization without a limit, and here the
    // limit is substantive rather than box-ticking.
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = remediateRepointBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const result = await remediateRepointedBankLedgerPostings({
      companyId: query.data.operating_company_id,
      actorUserUuid: user.uuid,
      bankAccountId: body.data.bank_account_id ?? null,
      dryRun: body.data.dry_run !== false,
      limit: body.data.limit,
    });
      return reply.code(200).send(result);
    }
  );
}


export default fp(async (app) => {
  await registerPostingEngineRoutes(app);
}, { name: "accounting.registerPostingEngineRoutes" });
