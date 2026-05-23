# Block-27: Fuel expense posting

Task ID: Block-27  
Branch: `feat/block-27-fuel-expense-posting`  
Depends on: Block-21 expense category resolver (`resolveAccountForCategory`)

## Why

Fuel is the largest operating expense category and must post from fuel events into the general ledger with deterministic account resolution and tenant-scoped auditability.

## Piece 0 investigation notes

1. **Fuel event source in this branch**
   - No `fuel.events` table exists in repo migrations or backend queries.
   - Canonical fuel transaction source is `fuel.fuel_transactions` (used by fuel planner, obligation reconciliation, and profitability reporting).
   - Fuel import/webhook path is documented in blueprint as Relay/fuel-card ingestion into `fuel.fuel_transactions`; implementation in this repo currently consumes that canonical table.

2. **Fuel category set**
   - Block-27 posting categories implemented as: `diesel`, `def`, `reefer`, `oil`, `misc`.
   - Posting resolves debit account through Block-21 map:
     `resolveAccountForCategory(operating_company_id, "fuel", kind)`.

3. **Driver fuel-advance liability surface**
   - Per-driver balances are tracked in `driver_finance.driver_liabilities` and linked via `driver_finance.driver_advances`.
   - Block-27 helper returns outstanding fuel advances for a driver using purpose `fuel_deposit` + liability current balance > 0.

## Piece A implementation

Added `apps/backend/src/accounting/fuel-posting/poster.service.ts`:

- `postFuelExpenseFromEvent(...)`
  - Debits fuel expense account resolved by Block-21 (`fuel` + `kind`).
  - Credits:
    - **Driver advance path**: fuel advance liability account.
    - **Company direct path**: cash-like account (default) or AP.
  - Captures IFTA-relevant state/gallons in account-resolution trace for downstream accrual logic.
  - Writes posting backbone records (`posting_batches`, `journal_entries`, `journal_entry_postings`, `transaction_source_links`) with `source_transaction_type = 'fuel_event'`.
  - Enforces tenant scope (`app.operating_company_id`) and idempotency keying.

## Piece B implementation

Added `getFuelAdvancesOutstandingForDriver(operating_company_id, driver_id)` in `poster.service.ts`:

- Returns outstanding fuel advances and total outstanding cents.
- Query constrained by tenant and driver.
- Intended integration point for Block-22 driver settlement deduction flow.

## Piece C implementation

Added CI guard:

- `scripts/verify-fuel-posting-uses-resolver.mjs`
  - Verifies poster imports and uses Block-21 resolver.
  - Prevents direct writes to expense-category map table.
  - Ensures fuel posting stamps `source_transaction_type = 'fuel_event'`.

Wired guard into:

- `scripts/verify-architectural-design.ts`

Added Vitest coverage:

- `poster-tenant-isolation.test.ts`
- `poster-driver-advance-path.test.ts`
- `poster-company-direct-path.test.ts`

## Deploy ordering note

DEPLOY ORDER: merge after Block-21. Largest single expense category; high-value posting block.
