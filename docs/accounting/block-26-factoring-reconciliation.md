# Block-26: Factoring reconciliation

## Scope

Block-26 adds statement-to-ledger reconciliation for factoring operations by matching Faro statement imports with accounting invoices and tagging discrepancy states.

- Reconciliation run header + item tables added under `factor.*`.
- Import flow reads `factor.faro_daily_imports` and `factor.faro_invoice_lines`.
- Item states: `matched`, `missing_in_ledger`, `missing_on_statement`, `amount_mismatch`.
- Match tolerance follows Q11 (`max($1.00, 0.01%)`).

## Backend

- Migration: `db/migrations/0224_block_26_factor_reconciliation.sql`
  - `factor.reconciliation_runs`
  - `factor.reconciliation_items`
  - RLS + grants + indexes
- Service: `apps/backend/src/accounting/factor-reconciliation/recon.service.ts`
  - `importStatement(...)`
  - `listReconciliationRuns(...)`
  - `listReconciliationItems(...)`
  - `listImportCandidates(...)`
- Routes: `apps/backend/src/accounting/factor-reconciliation/routes.ts`
  - `GET /api/v1/accounting/factor-reconciliation/import-candidates`
  - `POST /api/v1/accounting/factor-reconciliation/import`
  - `GET /api/v1/accounting/factor-reconciliation/runs`
  - `GET /api/v1/accounting/factor-reconciliation/runs/:run_id/items`
- Registration: `apps/backend/src/accounting/index.ts`

## Frontend

- New page: `apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx`
  - Candidate import list
  - Reconciliation run list
  - Item drill-down table
- API bindings added in `apps/frontend/src/api/accounting.ts`
- Navigation + routing:
  - `apps/frontend/src/pages/accounting/AccountingSubNav.tsx`
  - `apps/frontend/src/App.tsx`

## CI + tests

- Guard: `scripts/verify-factor-recon-tolerance-from-q11.mjs`
- Wired in `scripts/verify-architectural-design.ts`
- Tests:
  - `apps/backend/src/accounting/factor-reconciliation/__tests__/recon-tenant-isolation.test.ts`
  - `apps/backend/src/accounting/factor-reconciliation/__tests__/recon-match-states.test.ts`
  - `apps/backend/src/accounting/factor-reconciliation/__tests__/recon-tolerance.test.ts`

## Deploy order

Merge after Block-24 + Block-25.
