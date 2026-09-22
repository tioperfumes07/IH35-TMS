# LANE_CROSS — CC-3 touches `scripts/money-pr-local-gate.mjs` (CC-1's guard-authoring lane) for the escrow-ledger sign fix

**Date:** 2026-09-23. **Author:** CC-3, direct owner ruling this session.

## Why this is a lane cross

New `scripts/verify-*.mjs` files and edits to `scripts/money-pr-local-gate.mjs` are CC-1's lane
(guard authorship). The table this guard protects, `driver_finance.escrow_ledger`, and every
writer touched (`apps/backend/src/settlements/approval.service.ts`,
`apps/backend/src/driver-finance/settlement-payrun-close.service.ts`,
`apps/backend/src/driver-finance/escrow-forfeit.service.ts`,
`apps/backend/src/driver-finance/escrow-separation.service.ts`,
`apps/backend/src/driver-finance/settlement-payrun-reverse.service.ts`), are CC-3's own lane
(`driver_finance.*` / `apps/backend/src/driver-finance/**` per LANES.md); `settlements/approval.service.ts`
is the one file outside that literal glob, touched only for its single `escrow_ledger` INSERT.

## Why it's authorized without waiting

Owner, verbatim, this session: **"THE ESCROW WRITER HAS THE SIGN BACKWARDS... 56 of 60 rows are
backwards, so every driver's escrow balance reads inverted. FIX THE WRITER, not the rows — the
rows purge... Guard it: a 'hold' row with a positive amount is a build failure."** A direct,
explicit instruction to both fix the writer AND build the guard in the same pass.

## What changed

- New `apps/backend/src/driver-finance/escrow-ledger-sign.ts`: the one place the
  `driver_finance.escrow_ledger.amount_cents` sign is now derived from `transaction_type` (hold/
  forfeit negative, release positive, correction pass-through) instead of each of the 5 writers
  independently guessing.
- 5 writer files updated to call it instead of writing a raw or `Math.abs()`-forced value.
- One reader (`apps/backend/src/reports/driver-settlement-summary.routes.ts`) updated to `ABS()`
  its hold-sum so the "amount withheld" figure it displays keeps reading as a positive magnitude
  now that the underlying rows are signed.
- New `scripts/verify-escrow-ledger-sign-follows-type.mjs` (static: every writer calls the shared
  helper; live: no row violates the sign law) + `scripts/verify-escrow-ledger-sign-follows-type.baseline.json`
  (shrink-only ceiling on the 39 pre-fix rows — not corrected here per the owner's own "the rows
  purge" instruction).
- One `STEPS` entry added to `scripts/money-pr-local-gate.mjs`.

## Scope, explicitly bounded

This ruling authorizes exactly the files listed above. It does not authorize CC-3 to touch any
other part of `money-pr-local-gate.mjs`, or any other escrow-adjacent file not named here.

LANE_CROSS=LEAD-RULING-2026-09-23-CC3-ESCROW-LEDGER-SIGN-CROSS-LANE.md
