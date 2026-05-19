# Accounting Periods Design (BLOCK 11)

## Period Model

Accounting periods are stored in `accounting.periods` and are company-scoped by `operating_company_id`.

Core columns:

- `id`
- `operating_company_id`
- `period_start`
- `period_end`
- `fiscal_year`
- `period_label`
- `status` (`open`, `closing`, `closed`)
- `closed_at`
- `closed_by_user_id`
- `closing_notes`
- `locks_txn_dates_le`
- `retained_earnings_entry_id`

## Open/Closed Semantics

- **Open**: postings are allowed for dates in the period.
- **Closed**: posting dates at or before the closed cutoff are rejected.
- Closing and reopening update period state only; they do not directly mutate ledger lines except existing retained-earnings close behavior already wired in the close flow.

## Existing Posting Gate (Already In Place)

### App-level gate

`apps/backend/src/accounting/posting-engine.service.ts` already enforces closed-period locking through:

- `ensureOpenPeriod()`
- `SELECT accounting.closed_period_cutoff($1::uuid)`
- rejection with `PERIOD_LOCKED` / `IH35_CLOSED_PERIOD` token

Call sites already exist in both:

- `postSourceTransaction(...)`
- `reversePostedSourceTransaction(...)`

### DB-level gate

`accounting.raise_if_txn_in_closed_period(...)` and trigger functions enforce period locks at table level for:

- `accounting.invoices`
- `accounting.bills`
- `accounting.payments`
- `accounting.bill_payments`
- `accounting.journal_entries`

## Route Contract

### Read routes (new canonical read surface)

- `GET /api/v1/accounting/periods`
  - required query: `operating_company_id`
  - returns list items with:
    - `id`
    - `period_label`
    - `period_start`
    - `period_end`
    - `fiscal_year`
    - `status`
    - `closed_at`
- `GET /api/v1/accounting/periods/:id`
  - required query: `operating_company_id`
  - returns the same period fields for one period

Read roles: `Owner`, `Administrator`, `Manager`, `Accountant`.

Both routes are read-only and run under company-scoped RLS context.

### Existing write routes (left in place)

- `POST /api/v1/accounting/periods/:id/close`
- `POST /api/v1/accounting/periods/:id/reopen`

These remain in `p7-wave2.routes.ts` (no route relocation).  
Close is restricted to `Owner` / `Administrator` / `Accountant`.  
Reopen remains owner-only.
