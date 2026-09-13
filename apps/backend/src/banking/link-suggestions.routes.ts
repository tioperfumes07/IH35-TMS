/**
 * LOAD-TO-CASH CHAIN, LINK 4 — PR 1: READ-ONLY suggestion surface.
 *
 * Owner law B, verbatim (2026-09-12): "it should never automatch, it suggests and we accept it or
 * change the transactions." This file contains ZERO writes — no INSERT, no UPDATE, no DELETE
 * anywhere below. It renders ranked candidates (scored by link-suggestion-engine.ts, itself a pure
 * function) for every for-review bank transaction against accounting.expenses / accounting.bills /
 * accounting.invoices / driver_finance.driver_settlements / mdata.loads. The accept/reject flow that
 * actually writes matched_ / categorized_by_user_id columns is PR 2 (a separate, later change) — this route
 * cannot be reached by it and does not import anything from a write path.
 *
 * Reuses loadObligationCandidates() (obligation-reconcile.routes.ts) as the candidate source rather
 * than re-querying expenses/bills/invoices/settlements/loads a third time — see that file's own
 * header comment for why a fourth from-scratch candidate query was rejected.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { loadObligationCandidates } from "./obligation-reconcile.routes.js";
import { rankLinkCandidates, type LinkSuggestion } from "./link-suggestion-engine.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(1000).default(600),
});

type LinkSuggestionRole = "Owner" | "Administrator" | "Accountant";
const LINK_SUGGESTION_ROLES = new Set<LinkSuggestionRole>(["Owner", "Administrator", "Accountant"]);
function canView(role: string): role is LinkSuggestionRole {
  return LINK_SUGGESTION_ROLES.has(role as LinkSuggestionRole);
}

export type LinkSuggestionTransactionRow = {
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  is_credit: boolean;
  description: string | null;
  merchant_name: string | null;
  candidates: LinkSuggestion[];
};

export async function registerBankingLinkSuggestionsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/banking/link-suggestions",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canView(user.role)) return reply.code(403).send({ error: "forbidden" });

      const q = querySchema.safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

      await assertCompanyMembership(user.uuid, q.data.operating_company_id);

      const payload = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);

        // Only transactions still missing ALL FIVE columns the Lead's chain audit measured at
        // 0/518 populated — a row already matched on any one of them is not a suggestion target.
        // voided_at excluded the same way every other banking read excludes it.
        //
        // PR 2 addition: also require review_state = 'for_review'. A row can leave this queue
        // without ever touching the 5 matched_* columns above — Exclude (PR 2's own action) sets
        // review_state='excluded' with nothing else changed, and a separate flow can set
        // 'categorized'/'matched'/'transfer' via matched_payment_id/matched_transfer_id/
        // matched_journal_entry_id, none of which this route's candidate pool covers (see the
        // scorable-types comment below). Without this filter an Excluded transaction would
        // silently reappear here forever, making the Exclude action look like it did nothing.
        const txnRes = await client.query<{
          id: string;
          transaction_date: string;
          amount_cents: string | number;
          is_credit: boolean;
          description: string | null;
          merchant_name: string | null;
        }>(
          `
          SELECT id, transaction_date::text, amount_cents, is_credit, description, merchant_name
          FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid
            AND voided_at IS NULL
            AND review_state = 'for_review'
            AND matched_expense_id IS NULL
            AND matched_bill_id IS NULL
            AND matched_load_id IS NULL
            AND matched_settlement_id IS NULL
            AND matched_invoice_id IS NULL
          ORDER BY transaction_date DESC, created_at DESC
          LIMIT $2
          `,
          [q.data.operating_company_id, q.data.limit]
        );

        const candidates = await loadObligationCandidates(client, q.data.operating_company_id);
        // PR 1 scope is the ledger-document/obligation types the 5 target columns actually name —
        // fuel and work_order aren't among matched_expense_id/matched_bill_id/matched_load_id/
        // matched_settlement_id/matched_invoice_id, so they're excluded here to keep the candidate
        // pool honestly scoped to what a confirm action (PR 2) could actually write.
        const scorable = candidates.filter((c) =>
          ["expense", "bill", "ar_invoice", "settlement", "load"].includes(c.obligation_type)
        );

        // PR 2 addition: a Reject records match_state='rejected' on banking.reconciliation_matches
        // so "the same bad suggestion does not resurface" is actually true, not just a docstring
        // claim. ar_invoice has no ledger_entry_kind slot on that table (see PR 2's own header
        // comment on the schema gap) so a rejected invoice candidate cannot be remembered here —
        // a disclosed, real limitation, not silently dropped.
        const rejected = await client.query<{ bank_transaction_id: string; ledger_entry_kind: string; ledger_entry_id: string }>(
          `
          SELECT bank_transaction_id, ledger_entry_kind, ledger_entry_id
          FROM banking.reconciliation_matches
          WHERE operating_company_id = $1::uuid AND match_state = 'rejected' AND voided_at IS NULL
          `,
          [q.data.operating_company_id]
        );
        const rejectedKeys = new Set(rejected.rows.map((r) => `${r.bank_transaction_id}:${r.ledger_entry_kind}:${r.ledger_entry_id}`));

        const rows: LinkSuggestionTransactionRow[] = txnRes.rows.map((t) => {
          const amount = Math.abs(Math.round(Number(t.amount_cents)));
          const ranked = rankLinkCandidates(
            {
              amount_cents: amount,
              transaction_date: String(t.transaction_date).slice(0, 10),
              description: t.description,
              merchant_name: t.merchant_name,
            },
            scorable.map((c) => ({
              obligation_type: c.obligation_type,
              obligation_id: c.obligation_id,
              label: c.label,
              amount_cents: c.amount_cents,
              event_date: c.event_date,
              counterparty_name: c.counterparty_name,
            }))
          ).filter((c) => !rejectedKeys.has(`${t.id}:${c.obligation_type}:${c.obligation_id}`));
          return {
            bank_transaction_id: t.id,
            transaction_date: String(t.transaction_date).slice(0, 10),
            amount_cents: amount,
            is_credit: t.is_credit,
            description: t.description,
            merchant_name: t.merchant_name,
            candidates: ranked,
          };
        });

        return { transactions: rows, candidate_pool_size: scorable.length };
      });

      return payload;
    }
  );
}
