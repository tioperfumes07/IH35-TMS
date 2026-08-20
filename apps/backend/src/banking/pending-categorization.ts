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

/**
 * BANK-F13 — a transaction that is a SUPERSEDED COPY must not be offered for categorization.
 *
 * Re-linking a bank account (Plaid re-auth, institution change) creates a SECOND
 * `banking.bank_accounts` row for the SAME real account, and the feed re-imports the whole history
 * against it. Dedup cannot see this: the unique index is `(bank_account_id, dedup_hash)` — per
 * ACCOUNT — and the two rows' hashes differ. Measured on prod 2026-07-30: USMCA "USMCA FREIGHT"
 * (Bank of America, mask 3224) exists twice; the deactivated row holds 48 transactions and ALL 48 are
 * byte-identical (date + amount + description) to transactions on the ACTIVE row, with
 * `same_dedup_hash = 0`.
 *
 * Cash was never overstated — `sumAuthoritativeDepositoryCashCents` filters `is_active = true`. The
 * live exposure was here: this predicate filtered only by entity ("across ALL accounts"), so those 48
 * copies appeared in the For-review queue and were categorizable. Categorizing one POSTS IT TO THE GL,
 * double-booking a transaction the active account already carries.
 *
 * THE RULE IS DELIBERATELY NARROW. A copy is suppressed only when ALL of these hold:
 *   1. its own account row is inactive/deactivated, AND
 *   2. a DIFFERENT account row exists for the same (operating_company_id, institution_name,
 *      account_mask) that is ACTIVE, AND
 *   3. that active row carries an identical transaction (date + amount + description).
 *
 * Why not simply "hide transactions on deactivated accounts" — the obvious fix? Because on prod TRK's
 * Wells Fargo ••6103 / ••6129 / ••6137 have BOTH rows deactivated and hold 4,619 transactions between
 * them. There is no active twin, so nothing there is a superseded copy, and blanket-hiding would bury
 * 4,619 rows of genuine uncategorized work. Under this rule those stay visible, and only the 48 real
 * copies disappear. Suppression requires a surviving original — it can never hide the last copy of a
 * transaction.
 *
 * Cost: the correlated lookup starts from a primary-key hit on the transaction's own account and stops
 * immediately unless that account is inactive, so transactions on live accounts pay one PK probe.
 */
export function supersededDuplicatePredicate(alias = "bt"): string {
  return `NOT EXISTS (
      SELECT 1
      FROM banking.bank_accounts self_acct
      JOIN banking.bank_accounts twin_acct
        ON twin_acct.operating_company_id = self_acct.operating_company_id
       AND twin_acct.institution_name IS NOT DISTINCT FROM self_acct.institution_name
       AND twin_acct.account_mask     IS NOT DISTINCT FROM self_acct.account_mask
       AND twin_acct.id <> self_acct.id
       AND twin_acct.is_active = true
       AND twin_acct.deactivated_at IS NULL
      JOIN banking.bank_transactions twin_bt
        ON twin_bt.bank_account_id = twin_acct.id
       AND twin_bt.transaction_date = ${alias}.transaction_date
       AND twin_bt.amount_cents     = ${alias}.amount_cents
       AND COALESCE(twin_bt.description, '') = COALESCE(${alias}.description, '')
      WHERE self_acct.id = ${alias}.bank_account_id
        AND (self_acct.is_active = false OR self_acct.deactivated_at IS NOT NULL)
    )`;
}

// SQL boolean predicate for the given `banking.bank_transactions` alias (default `bt`).
// Status + not-a-superseded-copy. Both clauses live here on purpose: this function is the SINGLE
// source shared by the Banking Home KPI and the For-review queue, so neither surface can end up
// offering a duplicate the other hides.
export function pendingCategorizationPredicate(alias = "bt"): string {
  return `((${alias}.status = 'pending_categorization' OR ${alias}.status = 'uncategorized') AND ${supersededDuplicatePredicate(alias)})`;
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
