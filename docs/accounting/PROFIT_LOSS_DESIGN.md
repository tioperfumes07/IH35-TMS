# Profit & Loss Design (BLOCK 12)

## Definition

The Profit & Loss statement is a read-only ledger report for a date range:

- `revenue.total`
- minus `cogs.total`
- equals `gross_profit`
- minus `operating_expenses.total`
- equals `net_income`

All values are integer cents derived from posted ledger activity.

## Account Type Mapping

Approved mapping from `catalogs.accounts.account_type`:

- `REVENUE`: `Income`, `OtherIncome`
- `COGS`: `CostOfGoodsSold`
- `OPERATING EXPENSES`: `Expense`, `OtherExpense`

Excluded from P&L (balance sheet types):

- `Asset`
- `Liability`
- `Equity`

## Signing Rule

Natural-balance display rules:

- Revenue line amount = `credits - debits` (credit-normal)
- COGS line amount = `debits - credits` (debit-normal)
- Operating expense line amount = `debits - credits` (debit-normal)

This keeps revenue and expense sections positive in normal operation, with:

- `gross_profit = revenue.total - cogs.total`
- `net_income = revenue.total - cogs.total - operating_expenses.total`

## Ledger Aggregation Contract

The report reuses the Trial Balance ledger aggregation pattern:

- Source tables:
  - `accounting.journal_entry_postings`
  - `accounting.journal_entries`
  - `accounting.posting_batches`
  - `catalogs.accounts`
- Required filters:
  - `je.status <> 'voided'`
  - `(p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))`
- Grouping:
  - grouped by account (`account_number`, `account_name`, `account_type`)

## Other Income / Other Expense Tagging

No separate non-operating section is created in BLOCK 12.

- `OtherIncome` lines are folded into `revenue.total`
- `OtherExpense` lines are folded into `operating_expenses.total`

Each line item includes `account_type`, so a future block can split these into separate sections without changing the aggregation query.

## Route Contract

`GET /api/v1/accounting/profit-loss`

Query params:

- `operating_company_id` (required, UUID)
- `from_date` (optional, `YYYY-MM-DD`)
- `to_date` (optional, `YYYY-MM-DD`)

Response:

- `revenue`: `{ lines: [{ account_code, account_name, account_type, amount }], total }`
- `cogs`: `{ lines: [{ account_code, account_name, account_type, amount }], total }`
- `gross_profit`
- `operating_expenses`: `{ lines: [{ account_code, account_name, account_type, amount }], total }`
- `net_income`

## Empty-Ledger Behavior

When no P&L-relevant ledger activity exists (including net-zero reversed-only history):

- `revenue.total = 0`
- `cogs.total = 0`
- `operating_expenses.total = 0`
- `gross_profit = 0`
- `net_income = 0`
- all line arrays are empty
