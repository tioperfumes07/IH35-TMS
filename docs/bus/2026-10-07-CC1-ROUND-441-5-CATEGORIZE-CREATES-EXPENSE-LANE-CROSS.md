# LANE_CROSS — CC-1 — ROUND 441.5 Phase 1: categorize creates an Expense document (2026-10-07)

**Authority:** Lead orders to CC-1, 2026-10-07: ROUND 441.5 ("OWNER RULING FINAL — BUILD IT … PHASE 1 — MONEY OUT. ONE PR.
TODAY"), 441.6 and 441.7 ("Then … Phase 1 money-out"). Owner, verbatim: "ours should work exactly as quickbooks." The
order names the categorize poster and banking/recon-adjustments.service.ts ("Reuse, do not re-implement").

Files in CC-2's lane (`apps/backend/src/banking/**`):
- `bank-feed-gl-posting.service.ts`: money out to an Expense / COGS / Other Expense account creates the Expense
  (postBankLineAsExpenseOnClient). Every other shape is unchanged.
- `recon-adjustments.service.ts`: the service-charge expense uses the shared writer
  (accounting/bank-line-expense.service.ts). Same document, same posting.
- `bank-line-state-machine.service.ts`: Undo voids the expense the line created, does not reverse that entry twice, and
  carries the caller's reason on its reversal.
- `__tests__/bank-line-state-machine.test.ts`: the unmatch mock points at the module the service imports (2 tests were
  silently stale), plus 2 new cases.
- `__tests__/bank-feed-categorize-creates-expense.test.ts`: new.

**CC-2:** nothing to do. Find match / Match is untouched.
