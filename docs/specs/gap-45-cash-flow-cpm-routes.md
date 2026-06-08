# GAP-45 — Cash flow + per-truck CPM route fix

**Source:** P6-C1 · Reports Hub broken routes audit  
**Block:** GAP-45 · Wave G-U · Lane B

## Problem

- `/reports/cash-flow` returned data without honoring `operating_company_id` (TRK-only bleed).
- `/reports/per-truck-cpm` was listed in Reports Hub but had no route (404).

## Solution

1. **`route-fix.ts`** — Adds `GET /api/v1/reports/cash-flow` with strict OCI validation; does not mutate Block-14 accounting cash-flow service.
2. **`cpm-calculator.service.ts`** — Per-unit CPM = (driver pay + fuel + maintenance + allocated insurance/permits) / miles.
3. **Frontend** — `CashFlowReport.tsx` and `PerTruckCpmReport.tsx` at `/reports/cash-flow` and `/reports/per-truck-cpm`.

## Allocation methodology

| Cost bucket | Source |
|-------------|--------|
| Miles | `mdata.loads` practical/shortest miles in period |
| Driver pay | `driver_finance.driver_bills` joined to loads |
| Fuel | `fuel.fuel_transactions` on load |
| Maintenance | `maintenance.work_orders` actual cost in period |
| Insurance | `insurance.policy` + `insurance.policy_unit` via `mdata.assets`, premium / active units / 365 × days |
| Permits | `master_data.unit_permits.cost` (USD) / 365 × days |

Outliers: CPM > 2× fleet median highlighted in red on the frontend table.

## CI

`npm run verify:cash-flow-cpm-routes`
