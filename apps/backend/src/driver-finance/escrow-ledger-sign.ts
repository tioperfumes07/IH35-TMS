/**
 * ESCROW-LEDGER-SIGN-01 (owner ruling, 2026-09-23, verbatim): "A hold is a CREDIT to the driver's
 * escrow liability... Held = negative to him, credit to 2100-00-NNN. Released = positive... Fix
 * the writer; sign follows transaction_type, never the caller."
 *
 * ROOT CAUSE, measured live: driver_finance.escrow_ledger, USMCA -- 56 of 60 rows positive, net
 * +$1,624.99, while the real settlement documents show 80 lines, every one a hold, net
 * -$2,000.00. `apps/backend/src/settlements/approval.service.ts`'s own writer forced
 * `Math.abs(amountCents)` unconditionally before every INSERT -- the sign was discarded
 * regardless of whether the row was a hold or a release, exactly the "caller's guess" shape this
 * ruling rejects. The other 3 writers (settlement-payrun-close.service.ts, escrow-forfeit.service.ts,
 * escrow-separation.service.ts) each independently reimplemented the same INSERT with their own
 * ad-hoc sign choice -- none of them derived it from `transaction_type` in one shared place.
 *
 * This is the ONE place the sign is decided from here forward. `driver_finance.escrow_balances`
 * (`current_balance_cents` / `total_held_cents` / `total_released_cents`) and
 * `driver_finance.escrow_ledger.running_balance_cents` are UNCHANGED by this fix -- they track the
 * escrow POT's own magnitude (how much is currently held, a separate, already-correct concept)
 * and are not part of the owner's complaint, which was specifically about
 * `escrow_ledger.amount_cents`. Only `amount_cents` -- "the transaction's effect on the driver's
 * own position" -- is signed by this function.
 */

export type EscrowLedgerTransactionType = "hold" | "release" | "forfeit" | "correction";

/**
 * hold/forfeit: money moving AWAY from the driver (into or permanently out of escrow) -- negative
 * to him. release: money moving BACK to the driver -- positive. correction: the sign is data-
 * dependent (a manual adjustment can go either direction) and is never type-derived -- the caller
 * must already have the correct signed value; this function passes it through unchanged.
 */
const SIGN_BY_TYPE: Record<Exclude<EscrowLedgerTransactionType, "correction">, 1 | -1> = {
  hold: -1,
  forfeit: -1,
  release: 1,
};

/**
 * Returns the correctly-signed `amount_cents` value for an `driver_finance.escrow_ledger` row,
 * given only the transaction type and a magnitude (positive or already-signed -- Math.abs() is
 * applied first for hold/release/forfeit, so a caller's own sign guess can never leak through).
 */
export function signedEscrowLedgerAmountCents(
  transactionType: EscrowLedgerTransactionType,
  magnitudeCents: number
): number {
  if (transactionType === "correction") {
    return magnitudeCents;
  }
  return SIGN_BY_TYPE[transactionType] * Math.abs(magnitudeCents);
}
