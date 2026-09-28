# CC-2 — ROUND 190 full report — 2026-09-28

Terse pointer lives in `docs/bus/NOW-CC-2.md` (4KB cap). This is the full detail.

## Merged this round
- PR #23017: claim-reserve 11687 + repo-wide push-blocker fixes.
- PR #23027: driver-pay bulk mint (14/15 loads, $10,287.58, AUTH-114/115) + close-path
  recalculation fix, guard `verify-close-recalculates-bills-from-real-mileage.mjs` (step 11687).
- PR #23029: `seedExpense()` 4-bug fix (never worked before this) + 18 real expense rows
  ($2,588.17, AUTH-116), guard `verify-seed-expense-actually-works.mjs`.

## ROUND 190 items — status

1. **`accounting.expenses` was ZERO on the current active-board loads.** Fixed the writer that
   blocked ALL future settlement-cost-line expenses. The 18 rows imported this round do **NOT**
   touch the 14 loads on the Load Costs active board (13624-13639) — the xlsx export's real
   candidates are all on older, already-closed/settled loads (13587-13619). The 14 current loads
   genuinely have zero documented expense data anywhere available yet (no settlement/expense-
   report cycle has run for them) — an honest gap, not an import failure.

2. **Live bank/bills numbers, re-verified 2026-09-28 ~17:30Z:** bank transactions 912 (matches),
   bills active 90 (matches), bill_payments active 130 (matches). **Bank-match count is STALE in
   the Lead's own ROUND 190 text** (cited "ACTIVE matches 36 | UNMATCHED 876"); re-measured live:
   **100 matched / 812 unmatched** (912 total). Almost certainly superseded by Cursor's
   AUTH-110/111/112 bulk-accept work (ROUND 186) landing since that number was taken.

3. **Settlement-derived document linkage gap, per settlement:** NOT started — ROUND 190 landed
   mid-session alongside the driver-pay/seedExpense work; the fix that unblocks it (a working
   `seedExpense()`) just shipped. Next step: walk `driver_finance.driver_bills` /
   `fuel.fuel_transactions` / toll / DEF / cash-advance / `accounting.bill_payments` per open
   settlement and report the real gap before writing anything else.

4. **Fuel feed latest transaction_at per entity, live:**
   - USMCA: 2026-09-24T12:09:39Z, 450 rows, all `source='import'`.
   - TRANSP: 2026-09-11T23:13:48Z, 1631 rows.
   - TRK: 1 row, NULL transaction_at.

   **Root cause, USMCA:** `fuel.fuel_transactions` is populated EXCLUSIVELY by scripted, one-shot
   AlwaysTrack-truth-JSON import batches (`scripts/feed/*.mts` -> `seedFuel()`) — never a live
   cron or provider-API poll. The last 2 real settlements closed (5818, 5819, through 09-25) were
   posted through the Settlement Creator engine (signed PDFs), which has no fuel-seeding step —
   the feed was never invoked for them, not broken. No real diesel purchase data exists anywhere
   available to close the 09-25->today gap honestly: the newest fuel-card provider statement on
   this machine ends 09-21; the EXPENSES xlsx's only 2 rows dated inside the gap are a DEF
   purchase (deliberately excluded from `fuel.fuel_transactions` by design) and a tire-repair line
   (not fuel). Importing anything here would be fabrication. Real fix needs a fresh Loves/
   Dreamline provider statement pulled covering 09-22->today — not something this seat can
   generate.

5. **Load Costs page, loads 13624-13639:** driver pay now populated for 14 of 15; fuel/expenses
   genuinely have no real data yet for this set (item 1). NOT independently verified in Chrome
   this round — queued next.

6. **Guard `verify-close-recalculates-bills-from-real-mileage.mjs` (step 11687):** DONE, merged,
   live-proven.

## AUTH ledger this round
AUTH-114 (deadhead backfill, DONE), AUTH-115 (driver-bill mint, DONE), AUTH-116 (expense import,
DONE). AUTH-110/111/112 (Cursor's) and AUTH-113 (CC-1's) still OPEN, not this seat's.

## NOT YET STARTED
Item 3 (settlement-document linkage gap measurement), item 5's Chrome verification, ADD_PAYMENT/
DEDUCTIONS/CUSTOMER_CHARGES xlsx imports (need Settlement# cross-reference against
`driver_settlements.source_document_ref` — a real key exists, not built this round).
