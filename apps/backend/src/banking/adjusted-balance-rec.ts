/**
 * BANK-DOM-03 — adjusted-balance bank reconciliation (QBO/NetSuite methodology).
 *
 * adjusted_bank = statement_ending + deposits_in_transit − outstanding_checks
 * adjusted_book = beginning_balance + cleared_credits − cleared_debits
 * variance      = adjusted_bank − adjusted_book  (must be 0 to close)
 */

export type ReconTxnForAdjusted = {
  amount_cents: number;
  is_credit: boolean;
  reconciliation_cleared?: boolean | null;
};

export type AdjustedBalanceSummary = {
  beginningBalanceCents: number;
  statementEndingCents: number;
  clearedCreditsCents: number;
  clearedDebitsCents: number;
  depositsInTransitCents: number;
  outstandingChecksCents: number;
  adjustedBankBalanceCents: number;
  adjustedBookBalanceCents: number;
  varianceCents: number;
  /** @deprecated flat matched-sum; kept for response compatibility */
  bookBalanceCents: number;
  matchedCreditsCents: number;
  matchedDebitsCents: number;
};

export function computeAdjustedBalanceSummary(args: {
  beginningBalanceCents: number;
  statementEndingCents: number;
  transactions: ReconTxnForAdjusted[];
}): AdjustedBalanceSummary {
  const beginning = Number(args.beginningBalanceCents ?? 0);
  const statementEnding = Number(args.statementEndingCents ?? 0);

  let clearedCreditsCents = 0;
  let clearedDebitsCents = 0;
  let depositsInTransitCents = 0;
  let outstandingChecksCents = 0;

  for (const txn of args.transactions) {
    const amountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    const cleared = Boolean(txn.reconciliation_cleared);
    if (txn.is_credit) {
      if (cleared) clearedCreditsCents += amountAbs;
      else depositsInTransitCents += amountAbs;
    } else if (cleared) {
      clearedDebitsCents += amountAbs;
    } else {
      outstandingChecksCents += amountAbs;
    }
  }

  const adjustedBankBalanceCents = statementEnding + depositsInTransitCents - outstandingChecksCents;
  const adjustedBookBalanceCents = beginning + clearedCreditsCents - clearedDebitsCents;
  const varianceCents = adjustedBankBalanceCents - adjustedBookBalanceCents;

  return {
    beginningBalanceCents: beginning,
    statementEndingCents: statementEnding,
    clearedCreditsCents,
    clearedDebitsCents,
    depositsInTransitCents,
    outstandingChecksCents,
    adjustedBankBalanceCents,
    adjustedBookBalanceCents,
    varianceCents,
    // Legacy flat fields: cleared net (not matched-sum) so UI that still reads bookBalanceCents
    // sees the book side of the adjusted model.
    bookBalanceCents: adjustedBookBalanceCents,
    matchedCreditsCents: clearedCreditsCents,
    matchedDebitsCents: clearedDebitsCents,
  };
}
