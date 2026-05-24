# Block-22: Driver settlement engine

## Scope

Block-22 adds a tenant-scoped payroll settlement ledger and posting engine that computes draft settlements from completed loads and posts them to accounting as `Bill + BillPayment` (never journal entries).

## What shipped

- Added migration `0233_block_22_driver_settlement_engine.sql`:
  - `payroll.driver_settlements` (period-level settlement ledger)
  - `payroll.driver_settlement_line_items` (itemized settlement lines)
  - RLS policies and append-only constraints
- Added backend service:
  - `apps/backend/src/payroll/driver-settlement.service.ts`
  - `computeSettlement()` computes load pay + advance recovery and persists a draft settlement
  - `postSettlement()` idempotently posts as accounting Bill and BillPayment per VQ-INVQ9
- Added backend routes:
  - `POST /api/v1/payroll/driver-settlements/compute`
  - `POST /api/v1/payroll/driver-settlements/:settlement_id/post`
- Added tests:
  - `apps/backend/src/payroll/__tests__/driver-settlement.test.ts`
  - Fixture: one driver + 3 loads validates gross, deductions, net, and posting path
- Added CI guards:
  - `scripts/verify-driver-settlement-tenant-scope.mjs`
  - `scripts/verify-driver-settlement-uses-bill-not-je.mjs`
- Updated settlement PDF renderer to hydrate from `payroll.driver_settlements` when present (with fallback to legacy `driver_finance` source).

## Design notes

- Driver settlement posting intentionally calls `createBill()` + `payBill()` to preserve QBO vendor bill semantics and 1099 tracking.
- Service-level SQL sets and enforces `app.operating_company_id` for every settlement operation.
- The posting path is idempotent when settlement is already posted with bill/bill-payment references.

## Verification

- `npm run build:backend`
- `cd apps/frontend && npx tsc -b`
- `npm run verify:arch-design`
- `npx vitest run apps/backend/src/payroll/__tests__/driver-settlement.test.ts`
