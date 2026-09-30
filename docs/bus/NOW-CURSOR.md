# NOW-CURSOR — 2026-09-30 ROUND 274 remainder (CHECKs + reinstate + claim)

## HARD LINE
Obey `claude/00-SEAT-CONTRACT.md`. Close-out phases: `claude/00-THE-ACCOUNTING-CLOSE-OUT-DO-THIS-IN-ORDER.md` — Cursor = Phase 2 void engine.

## DONE — ROUND 273 #61+#62
#23158 + #23170 register DONE-VERIFIED. Live tip advances with main.

## ROUND 274 — THIS BRANCH closes the remainder

Landed earlier (#23170): EXECUTORS for all R274 entities · Plaid re-point helper · `verify-r274-void-engine-complete.mjs`.

This remainder:
1. **DB CHECKs** — `202614601800_r274_void_status_checks_and_liability_drift.sql` for expenses, driver_liabilities, driver_settlements, check_number_registry, work_orders. Factoring untouched (AUTH-132).
2. **Drift repair** — 2 `driver_liabilities` status `reversed`→`voided` (status_before_void preserved). Measured: only those 2 disagreed.
3. **Reinstatement** — `REINSTATE_DOCUMENT_FAMILIES` + `reinstateDocument` wired for driver_bill / driver_liability / driver_settlement / bank_transaction / check_number_registry / work_order. check_number_registry gets reinstated_* columns in the same migration.
4. **Claim 11610** — #23178 on main; step `11610-verify-r274-void-engine-complete.mjs`.
5. **WO void** — executeWorkOrder void now flips `status='cancelled'` so CHECK and engine agree.

## DO NOT
- Duplicate factoring AUTH-132
- Steal CC-2 factoring engine
- Edit applied migrations in place
- Start Phase 3 purge / phantom money (close-out law — engines first)
