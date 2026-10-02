/**
 * LOAD-TO-CASH CHAIN, LINK 4 — PR 2: THE HUMAN DECISION.
 *
 * Owner law B, verbatim (2026-09-12/13, PERMANENT): "it should never automatch, it suggests and
 * we accept it or change the transactions."
 *
 * OWNER LAW 2026-10-02 COMPETING-ENGINE AUDIT (Cursor lane — bank-match writer):
 * Accept is ONLY acceptReconMatch → acceptMatchWithResolveDifference
 * (apps/backend/src/accounting/bank-recon/match.service.ts). This file used to stamp
 * matched_*_id with its own UPDATE switch — a second accept writer. That path is retired.
 * Kinds the canonical engine cannot persist (bill / load / ar_invoice) refuse here with
 * use_match_drawer_for_kind — do not invent a second stamp path for them.
 *
 * Undo uses unmatchBankTransaction (same as the Match drawer Unmatch), never a local UPDATE.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { OBLIGATION_EXISTENCE_SQL } from "./obligation-reconcile.routes.js";
import {
  acceptReconMatch,
  unmatchBankTransaction,
} from "../accounting/bank-recon/recon-worklist.service.js";
import type { LedgerEntryKind } from "../accounting/bank-recon/match.service.js";

type LinkSuggestionRole = "Owner" | "Administrator" | "Accountant";
const LINK_SUGGESTION_ROLES = new Set<LinkSuggestionRole>(["Owner", "Administrator", "Accountant"]);
function canDecide(role: string): role is LinkSuggestionRole {
  return LINK_SUGGESTION_ROLES.has(role as LinkSuggestionRole);
}

const OBLIGATION_TYPE = z.enum(["expense", "bill", "ar_invoice", "settlement", "load"]);
type ObligationType = z.infer<typeof OBLIGATION_TYPE>;

/**
 * Only kinds the canonical Match engine (PERSISTABLE_MATCH_KINDS) can accept.
 * bill = view-only on Match (orphan write without bill_payment JE).
 * load / ar_invoice = not in PERSISTABLE_MATCH_KINDS — Match drawer owns the supported path.
 */
const CANONICAL_LEDGER_KIND: Partial<Record<ObligationType, LedgerEntryKind>> = {
  expense: "expense",
  settlement: "settlement",
};

const acceptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  obligation_type: OBLIGATION_TYPE,
  obligation_id: z.string().uuid(),
});
const rejectBodySchema = acceptBodySchema;
const bulkAcceptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        bank_transaction_id: z.string().uuid(),
        obligation_type: OBLIGATION_TYPE,
        obligation_id: z.string().uuid(),
      })
    )
    .min(1),
});
const excludeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
const undoBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
});

function sendValidationError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export type AcceptLinkSuggestionOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "obligation_not_found"
        | "transaction_not_found_or_already_matched"
        | "use_match_drawer_for_kind"
        | "match_engine_rejected";
      detail?: string;
    };

/**
 * Thin proxy to acceptReconMatch (→ acceptMatchWithResolveDifference). Never stamps matched_*_id here.
 */
async function acceptLinkSuggestionForUser(
  userUuid: string,
  companyId: string,
  txnId: string,
  kind: ObligationType,
  obligationId: string,
  auditSourceTag: string,
  auditExtra: Record<string, unknown> = {}
): Promise<AcceptLinkSuggestionOutcome> {
  const ledgerKind = CANONICAL_LEDGER_KIND[kind];
  if (!ledgerKind) {
    return { ok: false, reason: "use_match_drawer_for_kind" };
  }

  const existenceSql = OBLIGATION_EXISTENCE_SQL[kind];
  if (existenceSql) {
    const exists = await withCurrentUser(userUuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      return client.query(existenceSql, [obligationId, companyId]);
    });
    if (!exists.rows[0]) return { ok: false, reason: "obligation_not_found" };
  }

  try {
    await acceptReconMatch({
      operating_company_id: companyId,
      bank_transaction_id: txnId,
      actor_user_uuid: userUuid,
      ledger_entry_kind: ledgerKind,
      ledger_entry_id: obligationId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "bank_transaction_already_matched" || /already_matched/i.test(msg)) {
      return { ok: false, reason: "transaction_not_found_or_already_matched" };
    }
    if (msg === "bank_transaction_not_found" || /not_found/i.test(msg)) {
      return { ok: false, reason: "transaction_not_found_or_already_matched" };
    }
    if (msg === "expense_not_found" || msg === "expense_not_posted") {
      return { ok: false, reason: "obligation_not_found", detail: msg };
    }
    if (/match_kind_not_acceptable/i.test(msg)) {
      return { ok: false, reason: "use_match_drawer_for_kind", detail: msg };
    }
    return { ok: false, reason: "match_engine_rejected", detail: msg };
  }

  await withCurrentUser(userUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    await appendCrudAudit(
      client,
      userUuid,
      "banking.link_suggestion.accepted",
      {
        bank_transaction_id: txnId,
        obligation_type: kind,
        obligation_id: obligationId,
        operating_company_id: companyId,
        via: "acceptReconMatch",
        ...auditExtra,
      },
      "info",
      auditSourceTag
    );
  });

  return { ok: true };
}

export async function registerBankingLinkSuggestionActionsRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/banking/link-suggestions/accept",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canDecide(user.role)) return reply.code(403).send({ error: "forbidden" });

      const body = acceptBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      const { operating_company_id: companyId, bank_transaction_id: txnId, obligation_type: kind, obligation_id: obligationId } =
        body.data;

      await assertCompanyMembership(user.uuid, companyId);

      const result = await acceptLinkSuggestionForUser(user.uuid, companyId, txnId, kind, obligationId, "LINK4-PR2");

      if (!result.ok) {
        return reply.code(409).send({ error: result.reason, detail: result.detail ?? null });
      }
      return { ok: true };
    }
  );

  app.post(
    "/api/v1/banking/link-suggestions/bulk-accept",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canDecide(user.role)) return reply.code(403).send({ error: "forbidden" });

      const body = bulkAcceptBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      const { operating_company_id: companyId, items } = body.data;

      await assertCompanyMembership(user.uuid, companyId);

      const results: Array<{ bank_transaction_id: string; ok: boolean; reason?: string }> = [];
      for (const item of items) {
        const outcome = await acceptLinkSuggestionForUser(
          user.uuid,
          companyId,
          item.bank_transaction_id,
          item.obligation_type,
          item.obligation_id,
          "ROUND276-BULK-ACCEPT",
          { bulk_accept: true, bulk_accept_batch_size: items.length }
        );
        results.push(
          outcome.ok
            ? { bank_transaction_id: item.bank_transaction_id, ok: true }
            : { bank_transaction_id: item.bank_transaction_id, ok: false, reason: outcome.reason }
        );
      }

      return { results };
    }
  );

  app.post(
    "/api/v1/banking/link-suggestions/reject",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canDecide(user.role)) return reply.code(403).send({ error: "forbidden" });

      const body = rejectBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      const { operating_company_id: companyId, bank_transaction_id: txnId, obligation_type: kind, obligation_id: obligationId } =
        body.data;

      await assertCompanyMembership(user.uuid, companyId);

      // Reject memory only for kinds the reconciliation_matches CHECK supports.
      const rmKind = kind === "expense" || kind === "settlement" || kind === "bill" || kind === "load" ? kind : null;
      if (!rmKind) return reply.code(200).send({ ok: true, noted: false });

      await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        await client.query(
          `
          INSERT INTO banking.reconciliation_matches (
            operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id,
            match_score, match_state, matched_at, matched_by_user_uuid
          )
          VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, 0, 'rejected', now(), $5::uuid)
          ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
          DO UPDATE SET
            match_state = 'rejected',
            matched_at = now(),
            matched_by_user_uuid = EXCLUDED.matched_by_user_uuid,
            voided_at = NULL,
            void_reason = NULL,
            voided_by_user_id = NULL
          `,
          [companyId, txnId, rmKind, obligationId, user.uuid]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "banking.link_suggestion.rejected",
          { bank_transaction_id: txnId, obligation_type: kind, obligation_id: obligationId, operating_company_id: companyId },
          "info",
          "LINK4-PR2"
        );
      });

      return { ok: true };
    }
  );

  app.post(
    "/api/v1/banking/link-suggestions/exclude",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canDecide(user.role)) return reply.code(403).send({ error: "forbidden" });

      const body = excludeBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      const { operating_company_id: companyId, bank_transaction_id: txnId, reason } = body.data;

      await assertCompanyMembership(user.uuid, companyId);

      const result = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        const upd = await client.query(
          `
          UPDATE banking.bank_transactions
          SET review_state = 'excluded',
              excluded_reason = $1,
              categorized_by_user_id = $2::uuid,
              categorized_at = now(),
              updated_at = now()
          WHERE id = $3::uuid AND operating_company_id = $4::uuid
            AND voided_at IS NULL
          `,
          [reason, user.uuid, txnId, companyId]
        );
        if ((upd.rowCount ?? 0) === 0) return false;
        await appendCrudAudit(
          client,
          user.uuid,
          "banking.link_suggestion.excluded",
          { bank_transaction_id: txnId, reason, operating_company_id: companyId },
          "info",
          "LINK4-PR2"
        );
        return true;
      });

      if (!result) return reply.code(404).send({ error: "transaction_not_found" });
      return { ok: true };
    }
  );

  app.post(
    "/api/v1/banking/link-suggestions/undo",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canDecide(user.role)) return reply.code(403).send({ error: "forbidden" });

      const body = undoBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      const { operating_company_id: companyId, bank_transaction_id: txnId } = body.data;

      await assertCompanyMembership(user.uuid, companyId);

      // OWNER LAW 2026-10-02 — undo uses the canonical unmatchBankTransaction (same as Match drawer).
      await unmatchBankTransaction({
        operating_company_id: companyId,
        bank_transaction_id: txnId,
        actor_user_uuid: user.uuid,
      });

      await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        // Exclude-only rows may still need review_state reset when no matched_* was set.
        await client.query(
          `
          UPDATE banking.bank_transactions
          SET excluded_reason = NULL,
              review_state = CASE WHEN review_state = 'excluded' THEN 'for_review' ELSE review_state END,
              updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          `,
          [txnId, companyId]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "banking.link_suggestion.undone",
          { bank_transaction_id: txnId, operating_company_id: companyId, via: "unmatchBankTransaction" },
          "info",
          "LINK4-PR2"
        );
      });

      return { ok: true };
    }
  );
}
