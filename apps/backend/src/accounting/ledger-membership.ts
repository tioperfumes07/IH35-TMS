/**
 * THE ONE RULE for which journal-entry postings make up the books.
 *
 * A posting counts when its entry is not voided, is not sample data, and is either outside a posting batch or in a
 * batch that was posted (or posted and later reversed — the reversal is its own entry and counts on its own).
 *
 * WHY THIS FILE EXISTS (ACCT-F2026100601): the rule was hand-typed in ~15 readers and they did not agree. The trial
 * balance, balance sheet, P&L (both bases) and cash flow excluded `je.is_sample_data`; the Reclassify account tree, its
 * transaction list and accounting.fn_account_balances_as_of did not. The same ledger therefore showed one balance on
 * Reclassify and another on the statements, and a reader edited alone could drift again — as Reclassify's list once
 * hid reversal lines its own balance counted (ROUND 370). Every reader imports this; scripts/verify-one-ledger-membership-rule.mjs
 * fails on a re-typed copy and on a database function that does not hold the same three clauses.
 *
 * Statement-specific exclusions are NOT part of membership and stay with the statement that needs them: the P&L and
 * balance sheet leave out the period-close retained-earnings entry because it would net a closed period to zero.
 *
 * Aliases: the posting `p`, its entry `je`, and its batch `pb` LEFT JOINed on (pb.id = p.posting_batch_id AND
 * pb.operating_company_id = p.operating_company_id). Pass others when a query uses different ones.
 */
export function ledgerPostingCountsSql(alias: { p?: string; je?: string; pb?: string } = {}): string {
  const p = alias.p ?? "p";
  const je = alias.je ?? "je";
  const pb = alias.pb ?? "pb";
  return `${je}.status <> 'voided' AND COALESCE(${je}.is_sample_data, false) = false AND (${p}.posting_batch_id IS NULL OR ${pb}.batch_status IN ('posted', 'reversed'))`;
}

/** The rule with the default aliases (p / je / pb), for template literals. */
export const LEDGER_POSTING_COUNTS_SQL = ledgerPostingCountsSql();

/** The three clauses, as the guard checks them in the database function's text. */
export const LEDGER_MEMBERSHIP_CLAUSES = [
  "status <> 'voided'",
  "is_sample_data",
  "batch_status IN ('posted', 'reversed')",
] as const;
