# Date Range Engine Design (BLOCK 17)

## Purpose

BLOCK 17 adds a shared accounting date-range resolver that maps named range keys to concrete `from_date` / `to_date` values for report period pickers.

This block adds infrastructure only:

- shared resolver module
- date-ranges API route

It intentionally does **not** wire existing statement routes to consume range keys yet.

## Calendar-Year Basis

Relative presets use calendar year (Jan-Dec):

- quarters: Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec
- year boundaries: Jan 1 to Dec 31

Fiscal-year configuration is a future extension point and is not implemented in this block.

## Named Range Keys and Resolution Rules

All rules are relative to `reference_date` (`YYYY-MM-DD`):

- `this_month`: first day of reference month .. last day of reference month
- `last_month`: first day of previous month .. last day of previous month
- `this_quarter`: start of reference calendar quarter .. end of reference calendar quarter
- `last_quarter`: start of previous calendar quarter .. end of previous calendar quarter
- `this_year`: Jan 1 of reference year .. Dec 31 of reference year
- `year_to_date`: Jan 1 of reference year .. reference date
- `last_year`: Jan 1 of previous year .. Dec 31 of previous year
- `all_time`: `from_date = null`, `to_date = reference_date`
- `custom`: caller-supplied `from_date` + `to_date`, validated with `from_date <= to_date`
- `accounting_period`: resolved read-only from `accounting.periods` by period `id` (uuid) and company scope

## Month/Quarter/Year End Correctness

Month-end is computed by date arithmetic (day `0` of next month), so February and leap-year February are handled correctly.

Quarter ends are:

- Mar 31
- Jun 30
- Sep 30
- Dec 31

Year end is Dec 31.

## Accounting Period Option (By ID Only)

`accounting_period` resolution:

- query by `id` only (no label lookup)
- company-scoped (`operating_company_id`)
- returns:
  - `from_date = period_start`
  - `to_date = period_end`
  - `label = period_label` when present, otherwise derived fallback label

## Route Contract

`GET /api/v1/accounting/date-ranges`

Query params:

- `operating_company_id` (required)
- `reference_date` (optional, `YYYY-MM-DD`, defaults to current UTC date)
- `period_id` (optional UUID; when provided, resolves one `accounting_period` entry)

Response:

- `reference_date`
- `ranges: [{ key, from_date, to_date, label }]` for relative presets
- `accounting_period` (resolved object when `period_id` provided, else `null`)

Notes:

- `from_date` may be `null` only for `all_time`.
- Route is read-only and role-gated for accounting readers (`Owner`, `Administrator`, `Manager`, `Accountant`).

## Block Boundary

This block does not change statement routes (`trial-balance`, `profit-loss`, `balance-sheet`, `cash-flow`, `ar-aging`, `ap-aging`).
Range-key consumption by statement routes is a later block.
