# ESC-FORFEIT-SPLIT — forfeit must move driver_finance escrow store

**FINDING:** ESC-FORFEIT-SPLIT · **Lane:** FINANCIAL-HOLD · **Module:** driver-finance / accounting escrow  
**Separate from #3542** (sign fix on `apply_escrow_posting_delta` / `accounting.escrow_accounts` only).

## ROOT CAUSE
`escrow-forfeit.service.ts` wrote `accounting.escrow_postings` (+ optional `driver_liabilities`) but wrote
`driver_finance.escrow_balances` / `escrow_ledger` **zero times**. Driver-facing balance froze and overstated
what the driver is owed. `escrow_ledger` CHECK already allows `transaction_type='forfeit'` — design intent
never completed on the path.

## FIX
In the **same transaction** as the `accounting.escrow_postings` insert:
1. `UPDATE driver_finance.escrow_balances SET current_balance_cents = current_balance_cents - $amount`
2. `INSERT driver_finance.escrow_ledger (... transaction_type='forfeit', running_balance_cents=...)`
3. Fail loud (`E_ESCROW_BALANCES_MISSING`) if driver_finance cannot move — no accounting-only forfeit

Does **not** change `apply_escrow_posting_delta` (that is #3542).

## GUARD
`scripts/verify-esc-forfeit-split-driver-finance.mjs` + verify-step **1497**  
Optional: `IH35_ESC_FORFEIT_SPLIT_DSN=…` → `SPLIT_PROOF_OK` (both stores net same forfeited cents).

## FLAGS / DDL
- `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED` stays **OFF**
- No new migration required (path completion only); PR is owner-gated FINANCIAL-HOLD
- Owner Neon-applies #3542 mig separately; this PR can land after or stacked on #3542 tip

## OWNER
Merge gated. No CPA. QBO reconcile-only.
