# LANE_CROSS — CC-3 — ROUND 433 item 3: the Cash Flow Statement drills (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 3 assigns this to CC-3 ("a backend field, which is why it is yours"). It also moves item 2 (the 89 unwired money cells).

**Files:**
- `apps/backend/src/accounting/cash-flow.service.ts` and its new test
- `apps/frontend/src/api/reports.ts`
- `apps/frontend/src/pages/reports/CashFlowStatementPage.tsx`
- `scripts/verify-money-cells-click-through.mjs` (ceiling 89 → 88; selftest follows the constant)

**Defect:** lines were grouped by account TYPE:subtype ("Expense:fuel"), so no line had an `account_id` to drill to.

**Change:**
- One line per account, keyed and labelled "number name". A posting whose account row is missing keeps the type line, so nothing is dropped.
- Section totals are unchanged by construction: the same legs, summed under a finer key.
- Line amounts drill to the account register for the same period through AmountLink, which refuses a cash-basis drill because the register is accrual.
- The section total stays plain text. It spans many accounts and has no single honest target, and a null-filter AmountLink would only fake the count.

**CC-1:** nothing to do. This note is the record of the crossing.
