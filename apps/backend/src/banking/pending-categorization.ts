// Canonical "needs categorization" definition — the SINGLE source shared by the Banking Home
// UNCATEGORIZED KPI and the Transactions "For review" queue so the headline count can never diverge
// from the list it summarizes (BANKING-1).
//
// A bank transaction needs review while its status is either:
//   - 'pending_categorization' — e.g. CSV/statement-imported rows (the current ~2,650 backlog), or
//   - 'uncategorized'          — feed-ingested rows not yet classified.
//
// The Banking Home KPI previously summed views.banking_account_tiles.uncategorized_count, which
// counts ONLY status='uncategorized' → it read 0 while the For-review queue (both statuses) held
// thousands. Both surfaces now derive from this one predicate.

import { bankTransactionHiddenFilterSql, isBankAccountHideEnabled } from "./bank-account-visibility.js";

export const PENDING_CATEGORIZATION_STATUSES = ["pending_categorization", "uncategorized"] as const;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

// SQL boolean predicate for the given `banking.bank_transactions` alias (default `bt`).
export function pendingCategorizationPredicate(alias = "bt"): string {
  return `(${alias}.status = 'pending_categorization' OR ${alias}.status = 'uncategorized')`;
}

// Entity-scoped count of transactions needing categorization, across ALL accounts — the exact
// population the For-review queue lists for the same operating company.
export async function countUncategorizedTransactions(
  client: Queryable,
  operatingCompanyId: string
): Promise<number> {
  // BANK-ACCOUNT-HIDE: an account hidden for THIS entity contributes nothing to the count (flag OFF by
  // default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md). Shared by both the Banking Home
  // KPI and the For-review queue, so they can never diverge on hidden-account handling either.
  const hideOn = await isBankAccountHideEnabled(client, operatingCompanyId);
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND ${pendingCategorizationPredicate("bt")}
        ${bankTransactionHiddenFilterSql(hideOn, "bt")}
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

// FIX-3 (banking sync strip honesty): the Banking Home "Transactions" metric must be a count of
// REAL bank transactions (banking.bank_transactions — the canonical table, migration 0073), never a
// proxy count of qbo_sync_queue entities in status 'synced'. The queue count answers "how many things
// pushed to QBO" (any entity type), not "how many bank transactions exist" — a company with hundreds
// of categorized-but-not-yet-pushed transactions previously showed "Transactions: 0". Entity-scoped,
// same hidden-account convention as countUncategorizedTransactions so all three counts agree.
// UNFILTERED by the BANK_ACCOUNT_HIDE flag on purpose: the register (/plaid/company-transactions,
// /plaid/accounts) does not filter hidden accounts, so this tile must count the same to match it.
export async function countTotalBankTransactions(
  client: Queryable,
  operatingCompanyId: string
): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}
