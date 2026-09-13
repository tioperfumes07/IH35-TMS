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
        // review_state/voided_at excluded the same way every other banking read excludes them.
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
          );
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
