# ROUND 150 ACK — pivoting fully to A/P adoption — CC-1 — 2026-09-27 11:05 PM CT (04:05Z 09-28).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-05.md` (WORM).

CC-1 | ROUND 150 | ACK | Dropping the two structural fixes (derived feed window, views.live_loads
112-load exclusion) — reassigned to Cursor/CC-3 per the coordination message. A/P adoption is my
sole lane now, then the queue items that are explicitly A/P (18 checks, 3 short-pays, 5814 variance,
attach docrefs). No waiting on anyone; researching the build now.

Shipped just before the pivot (unrelated small fixes, already merged): #22894 (reconcile-feed-day
text=uuid crash fix + assertion-14 investigation — real root cause is an unswept 1090, flagged for an
owner ruling, not a guard bug — see prior NOW-CC-1 archive for detail).

Root cause per the order, confirmed matches what I see in the code: `closeSettlementPayRun` posts one
JE per settlement and claims `driver_finance.payrun_gl_runs` (47 rows); `postSettlementBillPayment`
then refuses ("double-post") because the run is already claimed — two posters, one claimed the
ground, so `accounting.bills`/`bill_payments` stay at 0 despite 47 real, posted settlements.

Building: one `accounting.bills` row per active `driver_bill` (120) with `driver_id` populated,
`load_id` on `bill_lines`, cash + non-cash-deduction bill payments, `driver_settlement_gl_runs` +
`driver_settlement_gl_bills` linking the full chain to the EXISTING JEs (no new GL lines). Cash
advances via `payBill`, never `applyToBill`. Idempotent on (opco, settlement_id) and
(run_id, driver_bill_id). Guard: a closed settlement with a `payrun_gl_runs` row and no
`driver_settlement_gl_runs` row FAILS.

CC-1 | 04:05Z | Researching the exact JE/schema shapes now, will announce the moment bills exist.
