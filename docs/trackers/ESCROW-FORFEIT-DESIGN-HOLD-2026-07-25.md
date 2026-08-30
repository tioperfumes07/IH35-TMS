# Escrow forfeiture design hold — SAF-ORPH-01 / SAF-ORPH-02

**Status:** HOLD · **Owner gate:** retained by the current safety completion manifest
**Future block:** `SAF-ORPH-01-FIX`

This tracker records the exact evidence source that the two qualifying HOLD rows cite. It does not turn
either row into PASS, enable posting, or authorize a production forfeiture.

## What is already closed

- `SAF-ORPH-01`: `accounting.apply_escrow_posting_delta()` maps `forfeiture` to a negative delta and
  raises on unknown posting types. The writer uses `posting_type: "forfeiture"`; the signed-delta guard
  mutation-proves that the former positive/catch-all behavior cannot return.
- `SAF-ORPH-02`: one forfeiture transaction writes `accounting.escrow_postings`, decrements
  `driver_finance.escrow_balances`, and appends `driver_finance.escrow_ledger`. It refuses an absent or
  insufficient driver balance rather than allowing a split-brain accounting-only result.

Canonical implementation:

- `apps/backend/src/driver-finance/escrow-forfeit.service.ts`
- `apps/backend/src/accounting/escrow/service.ts`
- `db/migrations/202608070000_escrow_forfeit_posting_type_sign_and_flag_seed.sql`

Regression evidence:

- `scripts/verify-escrow-forfeit-sign-delta.mjs`
- `scripts/verify-esc-forfeit-split-driver-finance.mjs`
- `scripts/verify-escrow-forfeit-posting.mjs`

## What each row is orphaned from

- `SAF-ORPH-01` is orphaned from a live forfeiture delta observation. The production posting flag
  `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED` remains deliberately OFF, so there is no live forfeiture
  posting against which to observe the signed accounting balance change.
- `SAF-ORPH-02` is orphaned from a live dual-subledger forfeiture observation for the same reason. With
  the posting path OFF, no production transaction can prove the accounting posting and driver-facing
  balance/ledger move together.

Existing settlement escrow deposits are not substitutes: they exercise a different posting type and do
not prove forfeiture direction or forfeiture atomicity. Static source and planted guards prove the fixed
implementation, but they do not manufacture the missing live event.

## Exit evidence

Keep both rows `HOLD`, `owner_hold: true`, and `prod_verified: false` until an authorized live forfeiture
can be exercised without inventing a real driver loss. Exit requires one labeled USMCA TEST lifecycle,
query-back of both subledgers plus the balanced journal entry, and reversal/void evidence. No TRANSP/TRK
data and no TMS-to-QBO write-back are permitted.
