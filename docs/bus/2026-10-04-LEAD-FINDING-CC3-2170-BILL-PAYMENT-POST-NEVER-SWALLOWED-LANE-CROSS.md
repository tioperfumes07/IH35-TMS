# LANE_CROSS — CC-3 — 2170 clearing: a bill payment's posting failure is never swallowed (Lead + owner, 2026-10-04)

Lead to CC-3: "ALSO MEASURED, separate finding, yours to open: 2170 Driver Net-Pay Clearing holds a CREDIT balance of
$71,215.96 across 234 lines. A clearing account must pass through to ~zero." Lead ACCT-F406: "fix the engine at the root, one
door, never a patch; ship a guard with every fix, red before green". Owner 2026-10-04: "ALWAYS FIX, NEVER DEFER".

Files: apps/backend/src/accounting/bills-bulk.routes.ts (+ test) · apps/backend/src/cash-advances/lumper-cash-advance-split.ts
(+ test) · scripts/verify-no-bill-payment-without-postings.mjs
