CC-1 | P0 real-board-fixes | PASS | shipped 6 of 6 P0 items | Neon yourself | NEXT=P1 SAMPLE-tagged live scenarios S1-S12

2026-08-18T03:37Z CC-1 | All 6 P0 items closed:
1. CLS-MONEY-KPI-FAKE-ZERO-ON-FAILURE — already fixed+guarded on main, closed stale board row (PR #8765).
2. LV-BANKING-STATUS-STRIP-MIXES-ACCOUNT-SCOPES — already fixed on main, live-confirmed 245/165/165 all agree (PR #8765).
3. LV-G18-INERT-ON-EXPENSE-LINES — REAL FIX (ACCT-F5420, PR #8770): paired backend line_category derivation + load_id + load_exemption_reason, plus FE corrected taxonomy regex + required no-load-reason field. Guard verify-step 3825 mutation-tested.
4. Expense actor backfill (earlier this session, PR #8694) + audit trigger remainder — REAL FIX (ACCT-F5421, PR #8776): 55 tables closed, class coverage 133/134, rehearsed on disposable Neon branch, idempotency proven.
5. LV-REPORTS-MAINT-COST-CONTRADICTORY-CLASSIFICATION-FLAGS — already fixed (PR #8475), re-verified live: vitest 7/7, T149 shows single coherent flag (PR #8782).
6. Built-floor cells (trk_bulk_register:gl_je, prepaid modal.create:gl_je, auto_deduction_policies:liability) — already honesty-dropped from Required by commit d785abe0d, re-verified via live matrix API all 3 confirmed (PR #8782).

Moving to P1: SAMPLE-tagged live scenarios (Bill→pay→void; Expense; Invoice send→GL; Receive payment; Manual JE; UUID-only voids; Bank categorize→JE; Vendor AP/Customer invoice residual cells; Settlement load label if still "not visible"; AR/AP aging honesty). Staying inside owner boundaries: no QBO backfill, no invented load FKs, no reserve/PP&E touches, no flag flips without a chat DECISION, no AR credit-memo feature build.
