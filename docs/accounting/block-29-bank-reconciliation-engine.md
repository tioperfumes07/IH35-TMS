# Block-29: Bank Reconciliation Engine

Task ID: Block-29  
Branch: `feat/block-29-bank-reconciliation-engine`

## Why

Bank transactions imported into `banking.bank_transactions` need deterministic matching against ledger-side entries to support reconciliation workflows and auditability.

## Piece 0 - Investigation

- Existing transaction source table is `banking.bank_transactions` (legacy routes already call this canonical table).
- Existing Phase 5 P5-T2 reconciliation flows live in `apps/backend/src/banking/reconciliation.routes.ts` and currently match against coarse entities (`load`, `bill`, `settlement`).
- Ledger entities now available for scoring in this block:
  - `accounting.payments` (`payment`)
  - `accounting.bill_payments` (`bill_payment`)
  - `banking.transfers` (`transfer`)
  - `accounting.journal_entries` + `accounting.journal_entry_postings` (`je`)

## Piece A - Migration

- Added `db/migrations/0219_block_29_bank_reconciliation_matches.sql`.
- Introduced `bank.reconciliation_matches` with tenant key `operating_company_id`, scoring metadata, state (`auto_matched`, `user_matched`, `rejected`), and actor/time stamps.
- Included RLS and tenant policy keyed off `current_setting('app.operating_company_id', true)`.

## Piece B - Match Engine

- Added `apps/backend/src/accounting/bank-recon/match.service.ts`.
- `findCandidates`:
  - Loads target bank transaction in tenant scope.
  - Pulls candidate ledger rows (`payment`, `bill_payment`, `transfer`, `je`) in time window.
  - Ranks by weighted score using amount/date/memo similarity.
  - Auto-matches only when:
    - Amount gap <= `max($1.00, 0.01% of amount)` (Q11 tolerance rule for this block).
    - Date gap <= 5 days.
    - Memo similarity >= 0.8.
  - Writes auto-match record to `bank.reconciliation_matches`.

## Piece C - Resolve Difference (Q8)

- Added `acceptMatchWithResolveDifference` in `match.service.ts`.
- When variance is non-zero:
  - Stores user match in `bank.reconciliation_matches`.
  - Posts balancing JE with difference booked to user-selected account.
  - Uses Block-20 cash-basis engine (`applyCashBasisSuppression`) to anchor recognition to actual cash hit (Q8 locked decision).

## Piece D - CI Guard + Vitest

- Added guards:
  - `scripts/verify-bank-recon-match-tenant-scope.mjs`
  - `scripts/verify-bank-recon-tolerance-from-q11.mjs`
- Wired both guards into `scripts/verify-architectural-design.ts`.
- Added tests:
  - `apps/backend/src/accounting/bank-recon/__tests__/match-tenant-isolation.test.ts`
  - `apps/backend/src/accounting/bank-recon/__tests__/match-auto-vs-manual.test.ts`
  - `apps/backend/src/accounting/bank-recon/__tests__/match-resolve-difference-q8.test.ts`

## Deploy Order

DEPLOY ORDER: merge after Block-34. UI is Block-30.
