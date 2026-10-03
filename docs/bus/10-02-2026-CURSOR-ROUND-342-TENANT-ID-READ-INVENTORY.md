# ROUND 342 — CURSOR tenant_id read inventory + v_factor_reserve_balance trap
Measured: 2026-10-02 · tip before CC-1 rename · branch `cursor/r342-tenant-oci-entity-keys-c89b`

## THE TRAP — `factoring.v_factor_reserve_balance`
Live view columns today (Neon bypass_rls=lucia, br-fancy-credit): `tenant_id`, `factor_id`, `balance_cents`, `last_movement_at`, `movement_count`.
After CC-1 renames `factoring.reserve_movement.tenant_id` → `operating_company_id`, the view OUTPUT field renames with it.
A screen reading `.tenant_id` gets `undefined` — blank reserve ≡ zero reserve.

### Live reader status (good news + still-dangerous types)
`getFactorReserveBalances` / `getReserveBalanceHistory` already read the KPI GL engine — NOT the view (OWNER LAW 2026-10-02 competing-engine).
`verify-one-factoring-purchase-engine.mjs` FORBIDS reading the view.
**Still dangerous:** API/FE types and mappers still name the field `tenant_id`. When any residual path (or a future SELECT from the view) returns `operating_company_id`, balance rows look empty.

### Every v_factor_reserve_balance / reserve field-name hit
- apps/backend/src/factoring/reserve.service.ts — FactorReserveBalanceRow.tenant_id + mapFactorReserveBalanceRow(row.tenant_id)
- apps/frontend/src/api/factoring.ts — Factor/Batch/LetterOfRelease/ReserveMovement types expose tenant_id
- apps/frontend/src/pages/factoring/__tests__/FactoringHome.reserve-real.test.tsx — fixture tenant_id
- apps/backend/src/factoring/reserve.service.test.ts — mocks FROM factoring.v_factor_reserve_balance (dead path)
- scripts/verify-one-factoring-purchase-engine.mjs — FORBIDS reading v_factor_reserve_balance (good)
- db/migrations/0290_factoring_reserve_running_balance.sql — VIEW SELECT tenant_id (CC-1 rename will change OUTPUT field name)

## GREP — every apps `tenant_id` file (89 files)
```
apps/backend/src/accounting/__tests__/accident-dire-scenario.db.test.ts
apps/backend/src/accounting/__tests__/insurance-claim-recovery-scenario.db.test.ts
apps/backend/src/accounting/__tests__/scenario-battery.db.test.ts
apps/backend/src/accounting/__tests__/worm-audit-actor-attribution.db.test.ts
apps/backend/src/accounting/allocations.service.ts
apps/backend/src/accounting/bills.routes.ts
apps/backend/src/accounting/bills.service.ts
apps/backend/src/accounting/factoring-posting/__tests__/chain-06-factoring-ar-tieout.db.test.ts
apps/backend/src/accounting/insurance-claim-recovery-posting/poster.service.ts
apps/backend/src/accounting/invoice-render.routes.ts
apps/backend/src/accounting/invoice-send.service.ts
apps/backend/src/accounting/pse-enforce.middleware.ts
apps/backend/src/accounting/pse-mirror.routes.ts
apps/backend/src/accounting/pse-mirror.service.ts
apps/backend/src/assets/assets.routes.ts
apps/backend/src/audit/__tests__/audit.service.test.ts
apps/backend/src/audit/audit.service.ts
apps/backend/src/banking/bulk-transactions.ts
apps/backend/src/compliance/missing-required.service.ts
apps/backend/src/cron/insurance-monthly-report.cron.ts
apps/backend/src/dispatch/load-profitability.service.ts
apps/backend/src/factoring/bank-match.service.ts
apps/backend/src/factoring/batch.routes.test.ts
apps/backend/src/factoring/batch.service.ts
apps/backend/src/factoring/factor.service.test.ts
apps/backend/src/factoring/factor.service.ts
apps/backend/src/factoring/factoring-kpi.service.ts
apps/backend/src/factoring/factoring.routes.ts
apps/backend/src/factoring/reserve.service.test.ts
apps/backend/src/factoring/reserve.service.ts
apps/backend/src/factoring/submission-queue.service.ts
apps/backend/src/home/__tests__/factoring-balance-invoice-linkage.db.test.ts
apps/backend/src/home/factoring-balance-invoice-linkage.service.ts
apps/backend/src/home/scenario-registry.ts
apps/backend/src/insurance/__tests__/policy-bill-schedule.service.test.ts
apps/backend/src/insurance/claim-columns.ts
apps/backend/src/insurance/claim.routes.test.ts
apps/backend/src/insurance/claim.routes.ts
apps/backend/src/insurance/coi-pdf-renderer.service.ts
apps/backend/src/insurance/coi-request.routes.test.ts
apps/backend/src/insurance/coi.service.ts
apps/backend/src/insurance/coverage-gap-units.shared.ts
apps/backend/src/insurance/coverage-gap.service.ts
apps/backend/src/insurance/dispersal.routes.ts
apps/backend/src/insurance/fleet-covered.shared.ts
apps/backend/src/insurance/late-fee.service.ts
apps/backend/src/insurance/lawsuit.routes.test.ts
apps/backend/src/insurance/lawsuit.routes.ts
apps/backend/src/insurance/payment-reminder.service.ts
apps/backend/src/insurance/payment-schedule.routes.test.ts
apps/backend/src/insurance/payment-schedule.routes.ts
apps/backend/src/insurance/policy-bill-schedule.service.ts
apps/backend/src/insurance/policy-cancel.service.ts
apps/backend/src/insurance/policy-create-atomic.service.ts
apps/backend/src/insurance/policy.routes.ts
apps/backend/src/insurance/refund-obligation.service.ts
apps/backend/src/insurance/resolve-asset-id.shared.ts
apps/backend/src/insurance/summary.routes.ts
apps/backend/src/insurance/type-catalog.routes.ts
apps/backend/src/integrity/anomaly-detector.service.ts
apps/backend/src/integrity/anomaly-status.routes.test.ts
apps/backend/src/integrity/anomaly-status.routes.ts
apps/backend/src/integrity/anomaly.shared.ts
apps/backend/src/maint/parts.routes.ts
apps/backend/src/maint/wo-ap-posting.service.ts
apps/backend/src/maintenance/internal-labor.routes.ts
apps/backend/src/maintenance/work-orders.routes.ts
apps/backend/src/master-data/customers/__tests__/free-time.test.ts
apps/backend/src/master-data/customers/free-time-detention.service.ts
apps/backend/src/mdata/ensure-equipment-asset.shared.ts
apps/backend/src/mdata/ensure-unit-asset.shared.test.ts
apps/backend/src/mdata/ensure-unit-asset.shared.ts
apps/backend/src/mdata/equipment.routes.ts
apps/backend/src/mdata/unit-aggregate.service.ts
apps/backend/src/mdata/units.routes.ts
apps/backend/src/mexico-ops/mx-permits.routes.ts
apps/backend/src/mexico-ops/mx-tolls.routes.ts
apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts
apps/backend/src/safety/damage-continuity/insurance-link.service.ts
apps/backend/src/safety/position-history/position-history.routes.ts
apps/backend/src/sync/qbo-accounts-push.ts
apps/backend/src/sync/qbo-customers-push.ts
apps/backend/src/sync/qbo-vendors-push.ts
apps/frontend/src/api/factoring.ts
apps/frontend/src/api/insurance.ts
apps/frontend/src/api/safety.ts
apps/frontend/src/components/__tests__/modal-x-close-audit.test.tsx
apps/frontend/src/pages/factoring/__tests__/FactoringHome.reserve-real.test.tsx
apps/frontend/src/pages/insurance/PolicyDetail.claims-reverse.test.tsx
```

## Neon classification — tables with tenant_id (bypass_rls=lucia)
Dual-scoped (has BOTH tenant_id + operating_company_id) — safe to switch reads NOW to OCI:
- factoring: bank_match_suggestion, batch, customer_factor_assignment, factor, letter_of_release, reserve_movement
  **DONE 2026-10-03** — apps reads use `COALESCE(operating_company_id, tenant_id)` (guard verify-r342-dual-scoped-factoring-reads).
- insurance: claim, coi_request, lawsuit, payment_schedule, policy, policy_unit, refund_obligation
  **OPEN** — next dual-scoped sweep.
- maintenance.internal_labor_log · master_data.customer_terms_history · mdata.mx_permits · mdata.mx_tolls_ledger

Rename-only (tenant_id, NO operating_company_id today) — ship WITH CC-1 rename, not before:
- accounting: bill_unit_allocation, coa_account, ps_category, ps_item, pse_posting_policy, vendor_subtype_pse_map
- audit.row_changes · factoring.canonical_factor_agreements · factoring.v_factor_reserve_balance (view)
- insurance.type_catalog · integrity: anomalies, anomaly, driver_metric, metric
- maint: part, pm_schedule · mdata: asset_status_history, assets

## Cross-entity rule (Cursor ↔ CC-3 Order 2) — PROPOSED SAME RULE
A load is cross-entity iff:
`mdata.loads.operating_company_id` does not equal the company implied by `source_entity_code`
(when `source_entity_code` IS NOT NULL), OR any FK from a company-scoped child points at a parent row whose `operating_company_id` differs.
`verify-no-cross-entity-loads` already asserts the source_entity_code half; CC-3 composite FKs assert the FK half. Same prose, both guards.
