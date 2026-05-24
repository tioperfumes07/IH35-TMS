# Block-23: Escrow posting flow

## Scope

Block-23 introduces first-class escrow ledgers in accounting, balance-conserving posting mechanics, and accounting UI visibility for escrow balances/history.

## What shipped

- Added migration `0234_block_23_escrow_posting_flow.sql`:
  - `accounting.escrow_accounts`
  - `accounting.escrow_postings`
  - append-only posting protections
  - trigger-driven balance conservation (`sum(postings) => account.balance_cents`)
  - RLS policies
- Added backend escrow service:
  - `openEscrow()`
  - `depositEscrow()`
  - `releaseEscrow()`
  - `listEscrowAccounts()`
  - `listEscrowPostings()`
- Added escrow API routes:
  - `POST /api/v1/accounting/escrow/open`
  - `POST /api/v1/accounting/escrow/deposit`
  - `POST /api/v1/accounting/escrow/release`
  - `GET /api/v1/accounting/escrow/accounts`
  - `GET /api/v1/accounting/escrow/accounts/:escrow_account_id/postings`
- Added accounting tab + UI page:
  - `/accounting/escrow`
  - account list + posting drilldown table
- Added Block-22 integration:
  - Posting a payroll settlement now auto-deposits to escrow when `driver_bond_deduction` line items are present.
- Added CI guards:
  - `verify-escrow-tenant-scope.mjs`
  - `verify-escrow-amount-conservation.mjs`
  - `verify-escrow-emits-audit.mjs`

## Design notes

- Deposits and releases create balanced JEs (`cash` vs `escrow liability`) using role resolver accounts.
- Escrow posting rows are immutable and drive the escrow balance update trigger.
- Escrow actions emit audit events for Block-40 traceability.

## Verification

- `npm run build:backend`
- `cd apps/frontend && npx tsc -b`
- `npm run verify:arch-design`
- `npx vitest run apps/backend/src/accounting/escrow/__tests__/service-balance-math.test.ts`
