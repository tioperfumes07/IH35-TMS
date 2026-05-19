# Trial Balance Design (BLOCK 10)

## Definition

The Trial Balance is a read-only ledger report that lists each account with posting activity in a selected date range and shows:

- total debits
- total credits
- net balance (`total_debits - total_credits`)

The report summary includes grand totals and a balance proof:

- `grand_total_debits`
- `grand_total_credits`
- `balanced` (`grand_total_debits === grand_total_credits`)

All amounts are ledger-native integer cents.

## Source Tables and Aggregation

Route: `GET /api/v1/accounting/trial-balance`

Primary source: `accounting.journal_entry_postings` joined to:

- `accounting.journal_entries` (entry date + voided status filter)
- `accounting.posting_batches` (reversal-safe batch status filter)
- `catalogs.accounts` (account code/name/type)

Grouping is strictly by account:

- `p.account_id`
- `a.account_number`
- `a.account_name`
- `a.account_type`

Debit/credit totals use CASE sums:

- `SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)`
- `SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END)`

## Reversal and Voided Handling

### Reversal-safe batch filter

Trial Balance includes lines where:

- `p.posting_batch_id IS NULL` (defensive handling of historical/manual lines), OR
- `pb.batch_status IN ('posted', 'reversed')`

This keeps original posted lines and compensating reversal lines in-scope so reversals net correctly.

### Voided journal entries exclusion (required)

Trial Balance explicitly excludes voided journal entries:

- `je.status <> 'voided'`

A voided journal entry is treated as never happened and must not contribute to Trial Balance totals.

## Batch-less Posting Line Finding

Pre-build read-only check on `accounting.journal_entry_postings`:

- `posting_batch_id IS NULL` count: **0**

Decision: keep the `IS NULL` branch as defensive code for compatibility. In the current dataset, it has no effect.

## Route Contract

`GET /api/v1/accounting/trial-balance`

Query params:

- `operating_company_id` (required, UUID)
- `from_date` (optional, `YYYY-MM-DD`)
- `to_date` (optional, `YYYY-MM-DD`)

Response shape:

- `rows`: array of account activity rows with:
  - `account_id`
  - `account_code`
  - `account_name`
  - `account_type`
  - `total_debits`
  - `total_credits`
  - `net_balance`
- `summary`:
  - `grand_total_debits`
  - `grand_total_credits`
  - `balanced`

Empty-ledger behavior:

- `rows: []`
- `summary.grand_total_debits: 0`
- `summary.grand_total_credits: 0`
- `summary.balanced: true`

Implementation guardrail:

- `balanced` is computed from the same returned grand totals (`grand_total_debits === grand_total_credits`), not hardcoded and not from a separate totals query.
