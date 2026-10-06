import type { FastifyInstance } from "fastify";
import { FactoringPurchaseOwnerOnlyError } from "../../factoring/owner-only-purchase.js";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { ReconciledSessionLockedError } from "../../banking/closed-session-immutability.js";
import { type LedgerEntryKind, acceptExactMultiDocumentMatch } from "./match.service.js";
import { ReceiveAndMatchError, receivePaymentsAndMatch } from "./receive-and-match.service.js";
import { acceptReconMatch, closeReconPeriod, getReconWorklist, rejectReconMatch, unmatchBankTransaction } from "./recon-worklist.service.js";

// ROUND 433 B8 — 'deposit' (a posted bank deposit — several receipts on one deposit slip) is a persistable match kind
// (PERSISTABLE_MATCH_KINDS, kind CHECK 202615360000) and the candidate list offers it, but no route accepted it.
const matchKindSchema = z.enum(["payment", "bill_payment", "transfer", "je", "expense", "deposit"]);

const worklistQuerySchema = companyQuerySchema.extend({
  account_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
});

const acceptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: matchKindSchema,
  ledger_entry_id: z.string().uuid(),
  variance_account_id: z.string().uuid().optional(),
});

const rejectBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: matchKindSchema,
  ledger_entry_id: z.string().uuid(),
});

const unmatchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
});

const manualBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: matchKindSchema,
  ledger_entry_id: z.string().uuid(),
  variance_account_id: z.string().uuid().optional(),
});

const multiAcceptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  entries: z
    .array(
      z.object({
        ledger_entry_kind: matchKindSchema,
        ledger_entry_id: z.string().uuid(),
      })
    )
    .min(2)
    .max(50),
  /** ROUND 433 B8 — a named account for a difference between the line and the selected documents. */
  difference_account_id: z.string().uuid().optional(),
});

const receiveAndMatchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  applications: z.array(z.object({ invoice_id: z.string().uuid(), amount_cents: z.coerce.number().int().positive() })).min(1).max(200),
  payment_method: z.enum(["ach", "wire", "check", "cash", "credit_card", "other"]).optional(),
  reference_number: z.string().trim().max(200).optional(),
  remainder: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("customer_credit"), customer_id: z.string().uuid() }),
      z.object({ kind: z.literal("difference"), account_id: z.string().uuid() }),
    ])
    .nullish(),
});

const closeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  account_id: z.string().uuid(),
  period_end: z.string().date(),
});

function canReconcile(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function asLedgerKind(value: string): LedgerEntryKind {
  return value as LedgerEntryKind;
}

export async function registerBankReconWorklistRoutes(app: FastifyInstance) {
  app.get("/api/v1/bank-recon/worklist", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = worklistQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const payload = await getReconWorklist({
      operating_company_id: query.data.operating_company_id,
      account_id: query.data.account_id,
      period_start: query.data.period_start,
      period_end: query.data.period_end,
    });
    return payload;
  });

  app.post("/api/v1/bank-recon/accept-match", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = acceptBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await acceptReconMatch({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
        ledger_entry_kind: asLedgerKind(body.data.ledger_entry_kind),
        ledger_entry_id: body.data.ledger_entry_id,
        variance_account_id: body.data.variance_account_id,
      });
      return { ok: true, result };
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (error instanceof FactoringPurchaseOwnerOnlyError) {
        return reply.code(403).send({ error: error.message, message: "Only the Owner matches a deposit to a factoring purchase." });
      }
      if (error instanceof ReconciledSessionLockedError) {
        return reply.code(409).send({ error: error.code, message: error.message });
      }
      if (message === "variance_account_id_required") {
        return reply.code(400).send({ error: message });
      }
      // BANK-RECON-ALREADY-MATCHED-500: bank_transaction_already_matched is a deliberate idempotency
      // guard (match.service.ts) firing when the same bank line is accepted twice (e.g. a double-click
      // or a stale worklist row) -- an expected conflict state, not a system failure. It fell through
      // to the generic `throw error` below and surfaced as a raw 500 instead of the 409 this file's
      // own close-period handler already uses for the equivalent "already in that state" case
      // (period_not_100pct_reconciled).
      if (message === "bank_transaction_already_matched") {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/bank-recon/reject-match", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = rejectBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    await rejectReconMatch({
      operating_company_id: body.data.operating_company_id,
      bank_transaction_id: body.data.bank_transaction_id,
      actor_user_uuid: user.uuid,
      ledger_entry_kind: asLedgerKind(body.data.ledger_entry_kind),
      ledger_entry_id: body.data.ledger_entry_id,
    });
    return { ok: true };
  });

  // BANK-F9998 F5 — MatchDrawer's own accept-match (above) needs no reconciliation session; unmatch
  // used to be reachable ONLY through reconciliation.routes.ts's session-scoped endpoint, so a bare
  // MatchDrawer confirm had no direct undo without first standing up a session for that period.
  // B-1 §5 (BANK-F31517): original-document OnlineBankingMatchBanner Unmatch posts here —
  // Expense / Bill Payment / Payment / Journal entry / Transfer / Factoring advance / Bill / Invoice.
  // register Edit → original document → Unmatch clears ✓ without a recon session.
  app.post("/api/v1/bank-recon/unmatch", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = unmatchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await unmatchBankTransaction({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
      });
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "bank_transaction_not_found") {
        return reply.code(404).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/bank-recon/manual-match", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = manualBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await acceptReconMatch({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
        ledger_entry_kind: asLedgerKind(body.data.ledger_entry_kind),
        ledger_entry_id: body.data.ledger_entry_id,
        variance_account_id: body.data.variance_account_id,
      });
      return { ok: true, result };
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (error instanceof FactoringPurchaseOwnerOnlyError) {
        return reply.code(403).send({ error: error.message, message: "Only the Owner matches a deposit to a factoring purchase." });
      }
      if (error instanceof ReconciledSessionLockedError) {
        return reply.code(409).send({ error: error.code, message: error.message });
      }
      if (message === "variance_account_id_required") {
        return reply.code(400).send({ error: message });
      }
      // BANK-RECON-ALREADY-MATCHED-500: bank_transaction_already_matched is a deliberate idempotency
      // guard (match.service.ts) firing when the same bank line is accepted twice (e.g. a double-click
      // or a stale worklist row) -- an expected conflict state, not a system failure. It fell through
      // to the generic `throw error` below and surfaced as a raw 500 instead of the 409 this file's
      // own close-period handler already uses for the equivalent "already in that state" case
      // (period_not_100pct_reconciled).
      if (message === "bank_transaction_already_matched") {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/bank-recon/accept-multi-match", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = multiAcceptBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await acceptExactMultiDocumentMatch({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
        entries: body.data.entries.map((e) => ({
          ledger_entry_kind: asLedgerKind(e.ledger_entry_kind),
          ledger_entry_id: e.ledger_entry_id,
        })),
        difference_account_id: body.data.difference_account_id ?? null,
      });
      return { ok: true, result };
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (error instanceof FactoringPurchaseOwnerOnlyError) {
        return reply.code(403).send({ error: error.message, message: "Only the Owner matches a deposit to a factoring purchase." });
      }
      if (error instanceof ReconciledSessionLockedError) {
        return reply.code(409).send({ error: error.code, message: error.message });
      }
      if (message === "bank_transaction_already_matched") {
        return reply.code(409).send({ error: message });
      }
      if (message.startsWith("multi_match_nonzero_variance:")) {
        return reply.code(400).send({ error: "multi_match_nonzero_variance", message });
      }
      if (message.startsWith("match_kind_not_acceptable:")) {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  // ROUND 433 B8 — one bank deposit applied to several invoices: the payments are created FROM the line and matched to it
  // in one transaction (receive-and-match.service.ts). Same role gate as every other accept.
  app.post("/api/v1/bank-recon/receive-and-match", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = receiveAndMatchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await receivePaymentsAndMatch({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
        applications: body.data.applications,
        payment_method: body.data.payment_method,
        reference_number: body.data.reference_number ?? null,
        remainder: body.data.remainder ?? null,
      });
      return { ok: true, result };
    } catch (error) {
      if (error instanceof ReceiveAndMatchError) return reply.code(error.status).send({ error: error.code, message: error.message });
      if (error instanceof ReconciledSessionLockedError) return reply.code(409).send({ error: error.code, message: error.message });
      const message = String((error as Error).message ?? "");
      if (message === "bank_transaction_already_matched" || message.startsWith("document_already_matched")) return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/bank-recon/close-period", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = closeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await closeReconPeriod({
        operating_company_id: body.data.operating_company_id,
        account_id: body.data.account_id,
        period_end: body.data.period_end,
        actor_user_uuid: user.uuid,
      });
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "period_not_100pct_reconciled") {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });
}


export default fp(async (app) => {
  await registerBankReconWorklistRoutes(app);
}, { name: "accounting.registerBankReconWorklistRoutes" });
