# Block-30: Bank reconciliation UI

## Scope

Block-30 adds the operator-facing reconciliation workflow on top of the Block-29 match engine.

- Worklist endpoint with unmatched rows, auto-matched candidates, variance-resolved entries, and progress.
- Accept / reject / manual match actions.
- Close-period gate requiring 100% matched-or-explicitly-skipped coverage.
- Two-pane UI for transaction review and actioning.

## Backend

- `apps/backend/src/accounting/bank-recon/recon-worklist.service.ts`
  - `getReconWorklist(...)`
  - `acceptReconMatch(...)`
  - `rejectReconMatch(...)`
  - `closeReconPeriod(...)`
- `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts`
  - `GET /api/v1/bank-recon/worklist`
  - `POST /api/v1/bank-recon/accept-match`
  - `POST /api/v1/bank-recon/reject-match`
  - `POST /api/v1/bank-recon/manual-match`
  - `POST /api/v1/bank-recon/close-period`
- `apps/backend/src/accounting/bank-recon/match.service.ts`
  - Adds `previewMatchVariance(...)` used by route/service validation.
- `apps/backend/src/accounting/index.ts`
  - Registers bank reconciliation worklist routes.

## Frontend

- `apps/frontend/src/pages/banking/BankReconciliationPage.tsx`
  - Two-pane layout:
    - Left: unmatched + auto-matched bank transactions.
    - Right: action area (accept/reject/manual), variance account picker, progress and close-period action.
  - Includes Q8 variance resolution flows via `variance_account_id`.
- `apps/frontend/src/api/banking.ts`
  - Adds API bindings for new `/api/v1/bank-recon/*` endpoints.
- `apps/frontend/src/App.tsx`
  - Routes `/banking/reconciliation` to the new page.
  - Keeps legacy workspace at `/banking/reconciliation-workspace`.

## CI + tests

- Guards:
  - `scripts/verify-bank-recon-ui-tenant-scope.mjs`
  - `scripts/verify-bank-recon-variance-uses-q8.mjs`
- Wired in `scripts/verify-architectural-design.ts`.
- Tests:
  - `apps/backend/src/accounting/bank-recon/__tests__/worklist-tenant-isolation.test.ts`
  - `apps/backend/src/accounting/bank-recon/__tests__/accept-match-no-variance.test.ts`
  - `apps/backend/src/accounting/bank-recon/__tests__/accept-match-with-variance-q8.test.ts`
  - `apps/backend/src/accounting/bank-recon/__tests__/close-period-requires-100pct.test.ts`

## Deploy order

Merge after Block-29.
UI completes the bank reconciliation feature.
