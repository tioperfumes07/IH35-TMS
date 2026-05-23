# Block-36: Multi-entity accounting

## Scope

Block-36 introduces consolidated accounting visibility across multiple operating companies.

- New tenant-safe backend endpoint for consolidated multi-company accounting summary.
- Access control validates requested companies against `org.user_company_access` (or Owner role).
- New accounting UI page to select companies/date range and view consolidated + per-company metrics.

## Backend

- Added `apps/backend/src/accounting/multi-entity/routes.ts`
  - `GET /api/v1/accounting/multi-entity/summary`
  - Input:
    - `operating_company_ids` (comma-separated UUIDs)
    - `start` (date), `end` (date)
  - Returns:
    - consolidated revenue/expense/net income
    - per-company summary
    - consolidated account debit/credit balances
- Registered routes in `apps/backend/src/accounting/index.ts`.

## Frontend

- Added `apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx`
  - Select multiple accessible companies
  - Select date range
  - Run consolidated summary
  - View consolidated cards, per-company table, and account balances table
- Added API bindings and types in `apps/frontend/src/api/accounting.ts`
  - `getMultiEntityAccountingSummary(...)`
- Added route in `apps/frontend/src/App.tsx`
  - `/accounting/multi-entity`
- Added accounting sub-nav entry in `apps/frontend/src/pages/accounting/AccountingSubNav.tsx`.

## CI + tests

- New architectural guards:
  - `scripts/verify-multi-entity-access-scope.mjs`
  - `scripts/verify-multi-entity-accounting-filter.mjs`
- Wired in `scripts/verify-architectural-design.ts`.
- Added backend unit test:
  - `apps/backend/src/accounting/multi-entity/__tests__/access-scope.test.ts`

## Deploy order

Depends on prior accounting and company-context access infrastructure already in place.
