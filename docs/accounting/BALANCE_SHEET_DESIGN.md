# Balance Sheet Design (BLOCK 13)

## Definition

The Balance Sheet is a point-in-time (as-of date) report that shows:

- Assets
- Liabilities
- Equity

and proves:

- `Assets = Liabilities + Equity`

## As-Of Date Semantics

Balance Sheet is not a range report.

- Include posting activity where `entry_date <= as_of_date`
- If `as_of_date` is omitted, default to today (`YYYY-MM-DD`)

## Ledger Aggregation Contract

The report reuses the same ledger pattern from Trial Balance / P&L:

- `accounting.journal_entry_postings`
- `accounting.journal_entries`
- `accounting.posting_batches`
- `catalogs.accounts`

Required filters:

- `je.status <> 'voided'`
- `(p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))`
- `je.entry_date <= as_of_date`

## Option Y Decision (Current-Year Earnings)

This system closes net income into equity only during year-end period close (`insertRetainedEarningsClosingJournalIfNeeded`), not continuously during open periods.

Therefore, Balance Sheet uses **Option Y**:

- Sum posted Asset/Liability/Equity balances
- Plus computed `current_year_earnings` as a separate equity line

This ensures the accounting equation holds during open periods as well.

### Current-Year Earnings Computation

Computed from P&L account activity up to `as_of_date`:

- Revenue types: `Income`, `OtherIncome` (credit-normal => `credits - debits`)
- Expense types: `CostOfGoodsSold`, `Expense`, `OtherExpense` (debit-normal => `debits - credits`)

Formula:

- `current_year_earnings = revenue_total - expense_total`

### Excluding Already-Closed Activity

To avoid double-counting periods already closed into retained earnings, current-year-earnings excludes postings from closing JEs linked by:

- `accounting.periods.retained_earnings_entry_id`

Specifically, P&L-side computation excludes `journal_entries.id` values present in that column for the same company.

## Account Classification and Signs

Balance-sheet section mapping:

- `Asset` -> assets section
- `Liability` -> liabilities section
- `Equity` -> equity section

Excluded (P&L types): `Income`, `OtherIncome`, `CostOfGoodsSold`, `Expense`, `OtherExpense`.

Sign rules:

- Asset line amount = `debits - credits`
- Liability line amount = `credits - debits`
- Equity base line amount = `credits - debits`

## Route Contract

`GET /api/v1/accounting/balance-sheet`

Query params:

- `operating_company_id` (required, UUID)
- `as_of_date` (optional, `YYYY-MM-DD`; defaults to today)

Response shape:

- `assets: { lines:[{account_code,account_name,account_type,amount}], total }`
- `liabilities: { lines:[...], total }`
- `equity: { lines:[...], current_year_earnings, total }`
- `total_liabilities_and_equity`
- `balanced` (`assets.total === total_liabilities_and_equity`)

`equity.total` is defined as:

- `sum(equity account lines) + current_year_earnings`

## Empty-Ledger Behavior

For empty or net-zero-reversed-only ledger state:

- all section totals are `0`
- `current_year_earnings = 0`
- `total_liabilities_and_equity = 0`
- `balanced = true`
