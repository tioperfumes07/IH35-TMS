# Cash Flow Design (BLOCK 14)

## Definition

Cash Flow Statement reports cash movement for a date range across:

- operating
- investing
- financing

and proves reconciliation:

- `net_cash_change = operating.total + investing.total + financing.total`
- `reconciled = (net_cash_change === cash_at_end - cash_at_start)`

## Method Choice

The report uses the **Direct Method**.

Rationale:

- Ledger postings are already double-entry and line-level, so cash legs and non-cash counterpart legs are available directly from journal entries.
- This supports deterministic cash movement classification now, without requiring additional non-cash adjustment models.

## Cash Account Definition

Cash accounts are defined as:

- `account_type = 'Asset'`
- `account_subtype IN ('Bank', 'Checking', 'Savings', 'CashOnHand', 'UndepositedFunds')`

## Ledger Filters and Date Scope

All ledger reads reuse the established report filters:

- join `journal_entry_postings` + `journal_entries` + `posting_batches` + `catalogs.accounts`
- `je.status <> 'voided'`
- `(p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))`

Date scope:

- cash movement buckets: journal entries in `[from_date, to_date]` (bounded only by provided params)
- `cash_at_start`: cash balance for `entry_date < from_date` (or `0` when no `from_date`)
- `cash_at_end`: cash balance for `entry_date <= to_date` (or all-time when `to_date` omitted)

## Direct-Method Algorithm

1. Identify cash JEs:
   - any journal entry in range with at least one cash-account posting line.
2. Compute JE cash amount:
   - net cash movement of cash legs using asset sign (`debits - credits`).
3. Classify by non-cash legs from the same JE.

### Trap 1: Multi-Leg Split

If a cash JE has multiple non-cash legs across categories:

- split JE cash amount proportionally by non-cash leg amounts
- allocate in integer cents with remainder distribution so allocated cents sum exactly to JE cash amount

### Trap 2: Cash-to-Cash Transfers

If a cash JE has no non-cash legs (all legs are cash accounts):

- treat as internal transfer
- contribute `0` to operating/investing/financing

## Classification Mapping

Counterparty-leg mapping:

- **Operating**
  - `account_type IN ('Income', 'OtherIncome', 'Expense', 'OtherExpense', 'CostOfGoodsSold')`
  - `Asset` subtypes: `AccountsReceivable`, `Inventory`, `OtherCurrentAssets`
  - `Liability` subtypes: `AccountsPayable`, `PayrollTaxPayable`, `OtherCurrentLiabilities`, `DeferredRevenue`
- **Investing**
  - long-lived/fixed-asset style `Asset` subtypes (including `LoansToOthers`)
- **Financing**
  - all `Equity`
  - `Liability` subtypes: `LoanPayable`, `NotesPayable`, `OtherLongTermLiabilities`

Fallback:

- unmatched non-cash legs default to **Operating**
- surfaced as `unclassified_leg_count` in response

## Route Contract

`GET /api/v1/accounting/cash-flow`

Query params:

- `operating_company_id` (required)
- `from_date` (optional, `YYYY-MM-DD`)
- `to_date` (optional, `YYYY-MM-DD`)

Response:

- `operating: { lines:[...], total }`
- `investing: { lines:[...], total }`
- `financing: { lines:[...], total }`
- `net_cash_change`
- `cash_at_start`
- `cash_at_end`
- `reconciled`
- `unclassified_leg_count`

## Empty-Ledger Behavior

With empty or net-zero reversed-only ledger activity:

- all bucket totals are `0`
- `net_cash_change = 0`
- `cash_at_start = 0`
- `cash_at_end = 0`
- `reconciled = true`
