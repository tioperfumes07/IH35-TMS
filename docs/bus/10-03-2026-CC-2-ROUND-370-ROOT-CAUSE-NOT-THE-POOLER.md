# CC-2 — ROUND 370 ROOT CAUSE — RECLASSIFY SHOWS A BALANCE AND NO TRANSACTIONS. IT IS NOT THE POOLED CONNECTION.

2026-10-03 · measured on the DIRECT endpoint, USMCA only, `SET LOCAL app.bypass_rls = 'lucia'`.

## The answer you asked for first: NOT the pooler

Both readers on the Reclassify screen run through the SAME client — `withCurrentUser`:

- the balance pane: `getAccountBalances()` -> `accounting.fn_account_balances_as_of` (`account-balances.service.ts`)
- the transaction list: `findReclassifyLines()` (`reclassify/reclassify.service.ts`)

Same connection, same RLS context, same company. So this one does **not** explain 367.1 by itself; 367.1 needs its own
measurement.

## Cause 1 — clicking an account never asks for its transactions (the owner's exact symptom)

`ReclassifyTransactionsPage.tsx:161` — clicking an account only does `setAccountId(...)`. The list query is
`enabled: !!applied` (`:86`), and `applied` is set **only** by the separate "Find transactions" button. A click on Fuel
or Diesel runs no list query at all: the balance renders, the grid stays blank, and blank looks like "no transactions".

## Cause 2 — the list hides rows the balance counts

The list filters `p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL`, on the comment "a reversed line and
its reversal net to zero". On the live book they do not, inside a date window: originals fall outside the window while
their reversals fall inside, and some lines are both a reversal and reversed (the void / unvoid churn). It also used
`je.status = 'posted'` where the balance uses `je.status <> 'voided'` + `posting_batches.batch_status IN ('posted','reversed')`.

Default window (2026-09-01 .. 2026-10-03), every USMCA account the balance function returns:

    accounts 39 · agree 35 · DISAGREE 4 · non-zero activity with an EMPTY list 1

    1000 Bank of America - Operating   activity 158,962.10   list 158,963.10   (175 reversed + 175 reversal + 1 both hidden)
    2000 Accounts Payable (A/P)        activity  -3,403.68   list    -566.35   (96 + 96 + 56 hidden)
    5400 Truck Repairs & Maintenance   activity     126.24   list     125.24   (7 + 7 + 1 hidden)
    9000 Ask My Accountant             activity   2,837.33   list       0.00   (60 + 60 + 56 hidden)  <- balance, no rows

## The fix (in build, ships with 368.1)

- Clicking an account loads its transactions immediately.
- The list uses the balance function's own predicate, so the sum of the listed rows IS the balance; reversed and
  reversal rows are shown, labelled, and not selectable for reclassify (you do not reclassify a voided line).
- "No transactions in this period" and "Could not read" are different screens.
- Guard: the listed sum equals the balance for every account, live.
