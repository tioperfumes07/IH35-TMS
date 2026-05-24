# Block-CF: 13-week rolling cash forecast

## Scope

Adds a rolling weekly cash projection with configurable recurring expense assumptions per operating company.

## Shipped

- New accounting endpoints:
  - `GET /api/v1/accounting/cash-forecast?weeks=13&operating_company_id=...`
  - `GET /api/v1/accounting/cash-forecast/settings?operating_company_id=...`
  - `PUT /api/v1/accounting/cash-forecast/settings`
- Projection model combines:
  - Current active bank-account balances (opening cash)
  - AR expected collections
  - AP expected payments
  - Factoring advances and fees
  - Recurring weekly estimates (fuel, insurance, lease, payroll)
- New UI page:
  - `/accounting/cash-forecast`
  - Line chart + weekly table
  - Inline settings editor for recurring weekly estimates
- Migration:
  - `db/migrations/0235_block_cf_cash_forecast_settings.sql`
  - Adds `accounting.cash_forecast_settings` with RLS + tenant policy
- CI guard:
  - `scripts/verify-cash-forecast-tenant-scope.mjs`
- Tests:
  - `apps/backend/src/accounting/__tests__/cash-forecast.routes.test.ts`
