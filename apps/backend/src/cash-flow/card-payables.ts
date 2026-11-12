import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { notVoided } from "../accounting/live-document-predicates.sql.js";
import { ledgerPostingCountsSql } from "../accounting/ledger-membership.js";
import { logger } from "../observability/structured-logger.js";

/**
 * ROWS 91 / 149 — the ONE reader of the fuel-card payable balances (Dreamline 2510, WEX 2520).
 * A card payable is a LIABILITY: an outstanding credit balance is a cash OUTFLOW owed to the card issuer,
 * never cash. Every cash-forecast surface (rolling ledger, weekly accounting forecast) reads it here;
 * nobody keeps a second copy of this query. Accounts are resolved BY ROLE, never by number or name.
 */
export const CARD_PAYABLE_ROLES = ["fuel_card_payable_dreamline", "fuel_card_payable_wex"] as const;
export type CardPayableRole = (typeof CARD_PAYABLE_ROLES)[number];

export type CardPayableBalance = {
  role: CardPayableRole;
  account_id: string;
  account_name: string;
  /** Outstanding credit balance (cents), always > 0 — a debit/zero balance owes nothing. */
  balance_cents: number;
  /** Already-incurred liability: due today unless the owner rolled it via cash_flow_row_adjustments. */
  due_date: string;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function readCardPayableBalances(
  client: Queryable,
  operatingCompanyId: string,
  today: string
): Promise<CardPayableBalance[]> {
  const out: CardPayableBalance[] = [];
  for (const role of CARD_PAYABLE_ROLES) {
    const accountId = await resolveRoleAccountOptional(client as never, operatingCompanyId, role);
    if (!accountId) continue; // unbound role = company has no such card (fails closed, as before)
    try {
      const res = await client.query<{ account_id: string; account_name: string; balance_cents: string | number }>(
        `
        SELECT ca.id::text AS account_id,
               ca.account_name,
               COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
          FROM catalogs.accounts ca
          JOIN accounting.journal_entry_postings jep ON jep.account_id = ca.id AND jep.operating_company_id = $1::uuid
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           AND je.operating_company_id = $1::uuid AND ${notVoided("je")}
          LEFT JOIN accounting.posting_batches pb ON pb.id = jep.posting_batch_id
           AND pb.operating_company_id = jep.operating_company_id
         WHERE ca.operating_company_id = $1::uuid AND ca.id = $2::uuid AND ca.deactivated_at IS NULL
           AND ${ledgerPostingCountsSql({ p: "jep", je: "je", pb: "pb" })}
           AND je.entry_date <= $3::date
         GROUP BY ca.id, ca.account_name
        `,
        [operatingCompanyId, accountId, today]
      );
      for (const r of res.rows) {
        const cents = Number(r.balance_cents ?? 0);
        if (cents > 0) out.push({ role, account_id: r.account_id, account_name: r.account_name, balance_cents: cents, due_date: today });
      }
    } catch (err) {
      logger.warn("cash-flow card-payables read failed", {
        operating_company_id: operatingCompanyId,
        role,
        error_stack: err instanceof Error ? err.stack : String(err),
      });
      // A missing issuer balance is unavailable, never a valid zero or partial total.
      throw err;
    }
  }
  return out;
}

/**
 * Card-payable OUTFLOWS for date-bucketed forecasts (weekly accounting forecast): the shared balances above, dated
 * by the owner's latest roll-over on accounting.cash_flow_row_adjustments (document_kind 'card_payable') when one
 * exists — that is the payment due date — else today; a row the owner hid is dropped. Same overlay rule the
 * rolling ledger applies, so the two forecasts cannot disagree on when the card is paid.
 */
export async function readCardPayableOutflows(
  client: Queryable,
  operatingCompanyId: string,
  today: string
): Promise<CardPayableBalance[]> {
  const balances = await readCardPayableBalances(client, operatingCompanyId, today);
  if (balances.length === 0) return balances;
  const adj = await client.query<{ document_id: string; projected_due_date: string | null; hidden_at: string | null }>(
    `
    SELECT DISTINCT ON (a.document_id)
           a.document_id::text AS document_id, a.projected_due_date::text AS projected_due_date, a.hidden_at::text AS hidden_at
      FROM accounting.cash_flow_row_adjustments a
     WHERE a.operating_company_id = $1::uuid AND a.document_kind = 'card_payable'
     ORDER BY a.document_id, a.seq DESC
    `,
    [operatingCompanyId]
  );
  const byDoc = new Map(adj.rows.map((a) => [a.document_id, a]));
  const out: CardPayableBalance[] = [];
  for (const b of balances) {
    const a = byDoc.get(b.account_id);
    if (a?.hidden_at) continue;
    out.push(a?.projected_due_date ? { ...b, due_date: a.projected_due_date } : b);
  }
  return out;
}
