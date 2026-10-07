# LANE_CROSS — CC-1 — ROUND 441.5 Phase 2: money-in categorize creates a Deposit document (2026-10-07)

**Authority:** Lead orders to CC-1, 2026-10-07: ROUND 441.5 ("PHASE 2 — MONEY IN. SEPARATE PR, STRAIGHT AFTER") and 441.9
item 5. Owner, verbatim: "ours should work exactly as quickbooks."

Files in CC-2's lane (`apps/backend/src/banking/**`):
- `bank-feed-gl-posting.service.ts`: money in to any account creates the Deposit (postBankLineAsDepositOnClient).
- `bank-line-state-machine.service.ts`: Undo voids the deposit the line created (voidBankDepositOnClient), and does not
  reverse that entry twice.
- `__tests__/bank-feed-categorize-creates-expense.test.ts` and `__tests__/bank-line-state-machine.test.ts`: the deposit
  cases.

**CC-2:** nothing to do. Find match / Match is untouched.
