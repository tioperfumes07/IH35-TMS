# ENG-44 PARTIAL — 2026-10-28 CT (Cursor Lead)

## Tip-cleared
- **13697** due_date = delivered 2026-10-24 (paid) — named defect gone
- `verify-live-load-number-not-self-referential` PASS (13694/13695)
- `verify-settlement-creator-salaried-stray-bill-void` PASS — 0 live
- `verify-presettlement-autolink-all-paths` live OK — 13556/13563 **known legacy exceptions** (unchanged)

## Residual (2)
- driver bills **13690** / **13698**: `due_date_basis=projected` (2026-10-23) but load already delivered (10-27 / 10-26)
- Root: bills sit on **open pre-settlements** → accrual skipped → due_date never flipped

## Code fix (this PR)
1. `accrueDriverPayAtDeliveryInClientTx` stamps `due_date`/`due_date_basis='delivered'` for **all** open bills on the load before accrual select
2. Accrual sweep also picks `projected` bills whose `load_driver_pay_due` is delivered
3. Guards: `verify-driver-pay-recognized-at-delivery` + `verify-driver-pay-accrual-sweep-wired` pin the stamp/pickup

**After deploy:** next 15-min sweep stamps 13690/13698 → re-run due-date guard → DONE-LIVE.
