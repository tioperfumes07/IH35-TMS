# NOW — CC-2 — ROUND 144 — 2026-09-27 5:35 PM CT (22:35Z)

Prior content archived byte-identical: `docs/bus/archive/NOW-CC-2-2026-09-27.md`.

FAST MERGE ON (`docs/bus/FAST-MERGE-4MIN-LAW.md`). Drained `gh pr list --author @me --state open`
before starting: 0 open. Fast-merged CC-1's ROUND 143 STEP 1 (#22883 -> `40f58065b5`) after confirming
its diff is the single-file guard fix and its only red (`locked-guards-heavy` orphan-guard check) is
pre-existing on main, unrelated to the diff.

**Verified live (Neon `tiny-field-89581227`, `bypass_rls=lucia`, USMCA), corrected Lead's two counts:**
- 11 missing check numbers (not 13): `1012 1013 1018 1019 1022 1023 1034 1039 1040 1042 1043`.
  1025/1026 are NOT missing -- both clear real checks ($1,150.00 / $360.39).
- 18 unmatched (not 14), $19,329.95 total, matching NOTHING in any TMS money table (settlements,
  driver_bills, expenses, bill_payments): `1004 1006 1008 1010 1011 1020 1021 1024 1025 1026 1031
  1032 1033 1041 1044 1045 1046 1047`. Boarding for CC-1 (A/P lane) below, same pass per Lead order.
- The 16 driver-settlement matches the Lead listed are exactly right, verified to the cent.
- Check-payment schema already live on prod (migration applied): `accounting.expenses` has
  `payment_type='check'`/`check_number`/`print_status`/`payee_kind`/`print_batch_id` etc., 0 rows used.
  `banking.check_number_registry` / `check_stock_settings` / `check_print_batches` / `_batch_items`
  all exist, all empty. Matches "cannot print today."

**BOARDED FOR CC-1 (A/P lane, not banking):** 18 cleared USMCA checks, $19,329.95, no bill/expense/
settlement/bill_payment anywhere -> missing A/P, not a numbering gap. List + amounts above. Needed
before STEP 4 adoption (bills=0 today).

**NEXT (this session, in order per Lead ROUND 144):**
1. `check_stock_settings` for bank `1000`/`e83028a5-dcda-4233-b660-5b9923b3d39c` with
   `next_check_number=1048`; `check_number_registry` backfill 1003-1047, the 11 absent numbers
   flagged `UNACCOUNTED`. Real backfill, no invented starting number.
2. Concurrency-safe sequential issuance proof for the next real check (1048+).
3. Write Check UI + print + void (void = VOID, never delete; will state burn-or-release on the
   number in that PR).
4. 311 settlement lines by canonical id (excluding 5817/5818/5819 -- owner says 5817/5818 do not
   exist and are signed, 5819 was wrongly voided and is real; holding until CC-1 restores them).
5. 31 deadhead $0.00 lines tabulation.

Quick Pay ruled: Faro discount already in 6400. Print only, post nothing.

Create Check background (superseded by the above -- same feature, ROUND 154 branch never landed):
local branch `claude/r154-check-engine-cc2-build` @ `9a008d5a22`, 23 commits, never pushed, rebases
clean onto origin/main. Will fold into the sequence above rather than push as-is (schema in that
branch predates the live migration state confirmed this turn).
