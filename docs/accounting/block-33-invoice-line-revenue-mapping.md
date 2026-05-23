# Block-33: Invoice Line Revenue Mapping

Task ID: Block-33  
Branch: `feat/block-33-invoice-line-revenue-mapping`

## Revenue Categories

- `linehaul`
- `fuel_surcharge` (mapped from invoice line type `fsc`)
- `detention`
- `layover`
- `lumper`
- `accessorial` (default for `accessorial`, `tonu`, `tax`, `adjustment`, `other`)

## Implementation

- Added revenue resolver service at `apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts`.
- Wired invoice-line writes through `resolveAccountForCategory(operating_company_id, 'revenue', revenue_code)` in:
  - `apps/backend/src/accounting/invoice-lines.routes.ts`
  - `apps/backend/src/accounting/from-load.ts`
  - `apps/backend/src/accounting/recurring.worker.ts`
- Added migration `0221_block_33_invoice_line_revenue_mapping.sql`:
  - Adds `revenue` to `accounting.expense_category_account_map` category-kind check.
  - Adds `account_id` + `revenue_code` to `accounting.invoice_lines`.
- Added idempotent backfill script:
  - `scripts/backfill-invoice-lines-account-id.mjs`
- Added CI guard:
  - `scripts/verify-invoice-lines-account-id-required.mjs`

## Deploy Order

DEPLOY ORDER: merge after Block-32. Revenue-side mirror of Block-32.
