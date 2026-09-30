# Cursor ROUND 274 remainder — 2026-09-30

## What landed
1. Migration `202614601800_r274_void_status_checks_and_liability_drift.sql`
   - Repair 2 driver_liabilities status reversed→voided
   - CHECKs: expenses, driver_liabilities, driver_settlements, check_number_registry, work_orders
   - check_number_registry reinstated_* columns
   - Idempotent Plaid match re-point
2. executeWorkOrder void flips status='cancelled' (CHECK parity)
3. REINSTATE_DOCUMENT_FAMILIES + reinstateDocument for driver_bill / liability / settlement / bank_transaction / check_number_registry / work_order
4. Claim 11610 (#23178) + verify-step wrapper
5. Close-out law file copied to claude/

## Measured before
- driver_liabilities drift = 2 (status=reversed + voided_at)
- Plaid orphans = 0 (already re-pointed)
- Factoring drift = 0 (AUTH-132)

## Not this PR
- Void detector item #5 (CC-1)
- Phase 3 phantom money purge (close-out order — engines first)
- Board UI #24–29
