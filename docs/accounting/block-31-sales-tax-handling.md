# Block-31: Sales tax handling

## Scope

Block-31 adds explicit sales-tax liability handling in posting plus operational sales-tax return workflows.

- Invoice posting now splits tax from revenue.
- Sales tax agencies and return lifecycle endpoints are implemented.
- Accounting UI now includes a Sales Tax page for agency setup and return prep/file/pay actions.

## Backend

- Updated `apps/backend/src/accounting/posting-engine.service.ts`
  - Invoice posting now:
    - debits AR for total invoice amount
    - credits revenue for `total_cents - tax_cents`
    - credits `sales_tax_payable` for `tax_cents`
  - Requires active CoA role mapping when tax exists.
- Added `apps/backend/src/accounting/sales-tax/routes.ts`
  - `GET /api/v1/accounting/sales-tax/agencies`
  - `POST /api/v1/accounting/sales-tax/agencies`
  - `GET /api/v1/accounting/sales-tax/returns`
  - `POST /api/v1/accounting/sales-tax/returns/prepare`
  - `POST /api/v1/accounting/sales-tax/returns/:id/file`
  - `POST /api/v1/accounting/sales-tax/returns/:id/mark-paid`
- Registered in `apps/backend/src/accounting/index.ts`.

## Frontend

- Added `apps/frontend/src/pages/accounting/SalesTaxPage.tsx`
  - Create agency
  - Prepare return from date range
  - Mark return filed / paid
  - Shows taxable, collected, and owed totals
- Extended `apps/frontend/src/api/accounting.ts` with sales-tax APIs/types.
- Added route in `apps/frontend/src/App.tsx`: `/accounting/sales-tax`
- Added accounting sub-nav entry in `apps/frontend/src/pages/accounting/AccountingSubNav.tsx`.

## CI + tests

- New guards:
  - `scripts/verify-sales-tax-posting-split.mjs`
  - `scripts/verify-sales-tax-routes-tenant-scope.mjs`
- Wired in `scripts/verify-architectural-design.ts`.
- Updated test:
  - `apps/backend/src/accounting/posting-engine.service.test.ts`
    - verifies invoice tax split credits revenue and sales_tax_payable separately.

## Deploy order

Depends on CoA roles (`sales_tax_payable`) from Block-35 being available.
