# Block-41: Posting lineage UI

## Scope

Block-41 adds an operator-facing Posting Lineage page that traces a single source transaction to its generated posting rows and linked objects.

## What shipped

- New page: `/accounting/posting-lineage`
  - file: `apps/frontend/src/pages/accounting/PostingLineagePage.tsx`
- Route wiring in `apps/frontend/src/App.tsx`
- Sub-nav entry in `apps/frontend/src/pages/accounting/AccountingSubNav.tsx`
- Uses Block-40 API contract:
  - `getAccountingSourceLineage(operating_company_id, source_transaction_type, source_transaction_id)`
- UI shows:
  - source filter form
  - lineage table with JE, posting batch, account, side, amount, linked object
  - debit/credit totals and balanced indicator

## Contract guard

- Added `scripts/verify-posting-lineage-ui-contract.mjs`
- Wired into `scripts/verify-architectural-design.ts`

## Verification

- `npm run build:backend`
- `cd apps/frontend && npx tsc -b`
- `npm run verify:arch-design`
