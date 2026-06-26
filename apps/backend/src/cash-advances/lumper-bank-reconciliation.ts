/**
 * Lumper Lifecycle STEP 5 — bank-match invariant.
 *
 * A single bank debit (e.g. the $400 cash-out) must reconcile to EXACTLY the sum of the split legs it paid:
 * the $250 bill_payment (linked via accounting.bill_payments.source_bank_transaction_id, set by STEP 3b) +
 * the $150 lumper expense (matched through the reconciliation session — accounting.expenses has no
 * source_bank_transaction_id column, so the expense leg is reconciled via banking.reconciliation_sessions,
 * not that column). This module is the AUTHORITATIVE, unit-tested invariant: sum(matched legs) === bank
 * debit — never an over- or under-match, never a floating remainder. Pure; the DB-level multi-record match
 * wiring is verified by GUARD on a Neon branch before any LUMPER_LIFECYCLE_ENABLED flip.
 */

export type MatchedBankLeg = {
  kind: "bill_payment" | "lumper_expense";
  record_id: string;
  amount_cents: number;
};

export type BankMatchValidation = { ok: true } | { ok: false; error: string; message: string };

/** sum(matched) MUST equal the bank debit; each leg a positive integer cents; at least one leg. */
export function validateBankDebitMatch(bankDebitCents: number, matched: readonly MatchedBankLeg[]): BankMatchValidation {
  if (!Array.isArray(matched) || matched.length === 0) {
    return { ok: false, error: "no_matched_legs", message: "a bank debit must match at least one split leg" };
  }
  for (const m of matched) {
    if (!Number.isInteger(m.amount_cents) || m.amount_cents <= 0) {
      return { ok: false, error: "invalid_leg_amount", message: `each matched leg must be positive integer cents; got ${String(m.amount_cents)}` };
    }
  }
  if (!Number.isInteger(bankDebitCents) || bankDebitCents <= 0) {
    return { ok: false, error: "invalid_bank_debit", message: `bank debit must be positive integer cents; got ${String(bankDebitCents)}` };
  }
  const sum = matched.reduce((acc, m) => acc + m.amount_cents, 0);
  if (sum !== bankDebitCents) {
    return { ok: false, error: "match_sum_mismatch", message: `matched legs sum to ${sum}c but the bank debit is ${bankDebitCents}c (over/under-match not allowed)` };
  }
  return { ok: true };
}

/** Unmatched remainder of a bank debit after applying these legs (0 when fully reconciled). */
export function bankMatchRemainderCents(bankDebitCents: number, matched: readonly MatchedBankLeg[]): number {
  const sum = matched.reduce((acc, m) => acc + Math.max(0, Math.trunc(Number(m.amount_cents) || 0)), 0);
  return bankDebitCents - sum;
}
