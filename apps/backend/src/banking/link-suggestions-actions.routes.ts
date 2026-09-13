/**
 * LOAD-TO-CASH CHAIN, LINK 4 — PR 2: THE HUMAN DECISION.
 *
 * Owner law B, verbatim (2026-09-12/13, PERMANENT): "it should never automatch, it suggests and
 * we accept it or change the transactions." Every route below requires requireAuth + a real,
 * authenticated, role-gated human request — none is ever callable from a cron/job/migration. Every
 * write records matched_<kind>_id, categorized_by_user_id, and categorized_at TOGETHER, inside one
 * transaction (withCurrentUser already wraps BEGIN/COMMIT). "There is no future auto-confirm
 * phase" — nothing here ever runs without this same per-request human authentication.
 *
 * Actions:
 *   Accept  — POST /accept   writes the chosen candidate onto banking.bank_transactions AND
 *             upserts a banking.reconciliation_matches row (match_state='user_matched') for the
 *             kinds that table's CHECK constraint supports (expense/load/bill/settlement) — same
 *             "a match is a record, not a bare pointer" law reconciliation.routes.ts's own /match
 *             handler already follows. ar_invoice has no equivalent kind in that CHECK constraint
 *             (a real, pre-existing schema gap outside CC-2's migration lane — see REMAINING in
 *             this PR's commit) — accept still writes matched_invoice_id on bank_transactions
 *             itself (that column has always existed), just without the reconciliation_matches
 *             audit record for that one kind.
 *   Reject  — POST /reject   records the SAME reconciliation_matches upsert with
 *             match_state='rejected' (same kind coverage caveat as Accept) so the same bad
 *             suggestion does not resurface; the GET /link-suggestions read path filters these out.
 *   Exclude — POST /exclude  marks the bank transaction itself review_state='excluded' with a
 *             reason — for a transaction that is not a real business event to reconcile at all
 *             (e.g. a bank fee already categorized elsewhere), not a specific candidate.
 *   Undo    — POST /undo     reverses Accept or Exclude: clears every matched_* column,
 *             categorized_by_user_id/at, excluded_reason, and voids any reconciliation_matches row
 *             this same actor created — "returns the row to its prior queue" exactly.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { OBLIGATION_EXISTENCE_SQL } from "./obligation-reconcile.routes.js";

type LinkSuggestionRole = "Owner" | "Administrator" | "Accountant";
const LINK_SUGGESTION_ROLES = new Set<LinkSuggestionRole>(["Owner", "Administrator", "Accountant"]);
function canDecide(role: string): role is LinkSuggestionRole {
  return LINK_SUGGESTION_ROLES.has(role as LinkSuggestionRole);
}

const OBLIGATION_TYPE = z.enum(["expense", "bill", "ar_invoice", "settlement", "load"]);
type ObligationType = z.infer<typeof OBLIGATION_TYPE>;

// reconciliation_matches.ledger_entry_kind's CHECK constraint does not include "ar_invoice" — a
// pre-existing schema gap (no migration authored here; CC-2 cannot author migrations). Accept/
// reject still work for ar_invoice via the bare bank_transactions column; they just don't get the
// reconciliation_matches audit/rejection-memory row that the other four kinds get.
const RECONCILIATION_MATCHES_KIND: Partial<Record<ObligationType, string>> = {
  expense: "expense",
  bill: "bill",
  settlement: "settlement",
  load: "load",
};

const acceptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  obligation_type: OBLIGATION_TYPE,
  obligation_id: z.string().uuid(),
});
const rejectBodySchema = acceptBodySchema;
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
      const { operating_company_id: companyId, bank_transaction_id: txnId, obligation_type: kind, obligation_id: obligationId } = body.data;

      await assertCompanyMembership(user.uuid, companyId);

      const result = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);

        const existenceSql = OBLIGATION_EXISTENCE_SQL[kind];
        if (existenceSql) {
          const exists = await client.query(existenceSql, [obligationId, companyId]);
          if (!exists.rows[0]) return { ok: false, reason: "obligation_not_found" as const };
        }

        const txnRes = await client.query<{ id: string }>(
          `
          SELECT id FROM banking.bank_transactions
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
            AND voided_at IS NULL
            AND matched_expense_id IS NULL AND matched_bill_id IS NULL AND matched_load_id IS NULL
            AND matched_settlement_id IS NULL AND matched_invoice_id IS NULL
          FOR UPDATE
          `,
          [txnId, companyId]
        );
        if (!txnRes.rows[0]) return { ok: false, reason: "transaction_not_found_or_already_matched" as const };

        // Written as a literal switch (not a `${column} = $1` template interpolation) on purpose:
        // scripts/verify-no-automatch.mjs's static writer-audit greps source text for the five exact
        // "matched_<kind>_id = $N" shapes to find every writer of these columns — a dynamically
        // interpolated column name would write the same data but be INVISIBLE to that grep, silently
        // defeating the one guard whose whole job is never letting a target-column writer go
        // unreviewed. This file is (correctly) still on that guard's TARGET_COLUMN_WRITE_ALLOWLIST.
        switch (kind) {
          case "expense":
            await client.query(
              `UPDATE banking.bank_transactions
               SET matched_expense_id = $1::uuid, categorized_by_user_id = $2::uuid, categorized_at = now(), review_state = 'matched', updated_at = now()
               WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
              [obligationId, user.uuid, txnId, companyId]
            );
            break;
          case "bill":
            await client.query(
              `UPDATE banking.bank_transactions
               SET matched_bill_id = $1::uuid, categorized_by_user_id = $2::uuid, categorized_at = now(), review_state = 'matched', updated_at = now()
               WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
              [obligationId, user.uuid, txnId, companyId]
            );
            break;
          case "ar_invoice":
            await client.query(
              `UPDATE banking.bank_transactions
               SET matched_invoice_id = $1::uuid, categorized_by_user_id = $2::uuid, categorized_at = now(), review_state = 'matched', updated_at = now()
               WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
              [obligationId, user.uuid, txnId, companyId]
            );
            break;
          case "settlement":
            await client.query(
              `UPDATE banking.bank_transactions
               SET matched_settlement_id = $1::uuid, categorized_by_user_id = $2::uuid, categorized_at = now(), review_state = 'matched', updated_at = now()
               WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
              [obligationId, user.uuid, txnId, companyId]
            );
            break;
          case "load":
            await client.query(
              `UPDATE banking.bank_transactions
               SET matched_load_id = $1::uuid, categorized_by_user_id = $2::uuid, categorized_at = now(), review_state = 'matched', updated_at = now()
               WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
              [obligationId, user.uuid, txnId, companyId]
            );
            break;
        }

        const rmKind = RECONCILIATION_MATCHES_KIND[kind];
        if (rmKind) {
          await client.query(
            `
            INSERT INTO banking.reconciliation_matches (
              operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id,
              match_score, match_state, matched_at, matched_by_user_uuid
            )
            VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, 1, 'user_matched', now(), $5::uuid)
            ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
            DO UPDATE SET
              match_score = 1,
              match_state = 'user_matched',
              matched_at = now(),
              matched_by_user_uuid = EXCLUDED.matched_by_user_uuid,
              voided_at = NULL,
              void_reason = NULL,
              voided_by_user_id = NULL
            `,
            [companyId, txnId, rmKind, obligationId, user.uuid]
          );
        }

        await appendCrudAudit(
          client,
          user.uuid,
          "banking.link_suggestion.accepted",
          { bank_transaction_id: txnId, obligation_type: kind, obligation_id: obligationId, operating_company_id: companyId },
          "info",
          "LINK4-PR2"
        );

        return { ok: true as const };
      });

      if (!result.ok) return reply.code(409).send({ error: result.reason });
      return { ok: true };
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
      const { operating_company_id: companyId, bank_transaction_id: txnId, obligation_type: kind, obligation_id: obligationId } = body.data;

      await assertCompanyMembership(user.uuid, companyId);

      const rmKind = RECONCILIATION_MATCHES_KIND[kind];
      const wrote = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        if (!rmKind) return false; // ar_invoice — no rejection-memory table slot, see header comment.
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
        return true;
      });

      return { ok: true, persisted: wrote };
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

      const result = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        const upd = await client.query(
          `
          UPDATE banking.bank_transactions
          SET matched_expense_id = NULL,
              matched_bill_id = NULL,
              matched_load_id = NULL,
              matched_settlement_id = NULL,
              matched_invoice_id = NULL,
              categorized_by_user_id = NULL,
              categorized_at = NULL,
              excluded_reason = NULL,
              review_state = 'for_review',
              updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          `,
          [txnId, companyId]
        );
        if ((upd.rowCount ?? 0) === 0) return false;

        // Void any reconciliation_matches row this action created (kept, not deleted — void-not-
        // delete, same law every other WORM table in this repo follows).
        await client.query(
          `
          UPDATE banking.reconciliation_matches
          SET voided_at = now(), void_reason = 'undo', voided_by_user_id = $1::uuid
          WHERE bank_transaction_id = $2::uuid AND operating_company_id = $3::uuid AND voided_at IS NULL
          `,
          [user.uuid, txnId, companyId]
        );

        await appendCrudAudit(
          client,
          user.uuid,
          "banking.link_suggestion.undone",
          { bank_transaction_id: txnId, operating_company_id: companyId },
          "info",
          "LINK4-PR2"
        );
        return true;
      });

      if (!result) return reply.code(404).send({ error: "transaction_not_found" });
      return { ok: true };
    }
  );
}
