# Block 10/44 — Account Balances View

**Status:** DONE — `feat/acct-block-10-account-balances`  
**Phase:** B (Financial Statements)  
**PR:** pending  
**Migration:** `202606072356_accounting_account_balances.sql`

## What This Block Delivers

A ledger-backed, per-account balance endpoint that returns cumulative (inception-to-date)
balances as of any date, plus optional opening/period breakdown.  This is the building block
consumed by Block 13 (Balance Sheet) and Block 14 (Cash Flow).

## What Block 9 (Trial Balance) Already Provides

| Capability | Trial Balance | Account Balances |
|---|---|---|
| Period activity (debits + credits in a date window) | ✓ | ✓ |
| Cumulative (inception-to-date) closing balance | ✗ | ✓ |
| Opening balance at period start | ✗ | ✓ |
| `normal_balance` sign per account type | ✗ | ✓ |

## DB Artifact

```
Schema:    accounting
Function:  fn_account_balances_as_of(p_company_id uuid, p_as_of_date date, p_from_date date DEFAULT NULL)
Language:  SQL  STABLE  SECURITY INVOKER
```

### Return Columns

| Column | Type | Notes |
|---|---|---|
| `account_id` | uuid | |
| `account_code` | text | `catalogs.accounts.account_number` |
| `account_name` | text | |
| `account_type` | text | Asset / Liability / Equity / Income / OtherIncome / CostOfGoodsSold / Expense / OtherExpense |
| `normal_balance` | text | `debit` for Asset/COGS/Expense/OtherExpense; `credit` for all others |
| `opening_balance_cents` | bigint | Cumulative net through day before `p_from_date`; `NULL` when `p_from_date` omitted |
| `period_debits_cents` | bigint | Gross debits in window |
| `period_credits_cents` | bigint | Gross credits in window |
| `period_activity_cents` | bigint | Net (debits − credits) in window |
| `closing_balance_cents` | bigint | Cumulative net through `p_as_of_date`; equals `opening + period_activity` when `p_from_date` set |

### Ledger Filters (identical to Trial Balance)

- `je.status <> 'voided'`
- `posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed')`

## API Endpoint

```
GET /api/v1/accounting/account-balances
```

### Query Parameters

| Param | Required | Default | Notes |
|---|---|---|---|
| `operating_company_id` | ✓ | — | UUID |
| `as_of_date` | ✓ | — | `YYYY-MM-DD` |
| `from_date` | — | `null` | `YYYY-MM-DD`; enables opening_balance |
| `basis` | — | `accrual` | `accrual` \| `cash` |

### Response Shape

```json
{
  "accounts": [
    {
      "account_id": "<uuid>",
      "account_code": "1010",
      "account_name": "Checking – IH35",
      "account_type": "Asset",
      "normal_balance": "debit",
      "opening_balance_cents": 150000,
      "period_debits_cents": 50000,
      "period_credits_cents": 20000,
      "period_activity_cents": 30000,
      "closing_balance_cents": 180000
    }
  ],
  "as_of_date": "2026-06-30",
  "from_date": "2026-06-01",
  "basis": "accrual",
  "generated_at": "2026-06-07T23:56:00.000Z"
}
```

### RBAC

Owner / Administrator / Manager / Accountant (same as Trial Balance).

## Cash Basis Integration

When `basis=cash`, `applyCashBasisSuppression` is applied post-aggregation:

- **AR accounts** (Asset + name contains "accounts receivable" / "a/r"): zeroed — decision Q3
- **AP accounts** (Liability + name contains "accounts payable" / "a/p"): zeroed — decision Q3
- **Factoring advance accounts**: reclassified to Liability — decision Q1
- **All others**: pass through — decision Q10

Opening/period fields are zeroed proportionally for suppressed accounts.

Cash-basis snapshots for account-balances are NOT included in period-close snapshots (Block 11).
If/when needed, add `"account_balances"` to the snapshot payload in
`accounting/cash-basis/snapshot.service.ts`.

## Files

| File | Role |
|---|---|
| `db/migrations/202606072356_accounting_account_balances.sql` | DB function + grants |
| `apps/backend/src/accounting/account-balances.service.ts` | Service layer |
| `apps/backend/src/accounting/account-balances.routes.ts` | Fastify route |
| `docs/accounting/block-10-account-balances.md` | This document |
| `.block-ready/ACCT-BLOCK-10-ACCOUNT-BALANCES.json` | Block manifest |

## Consumers

- **Block 13 (Balance Sheet):** call `getAccountBalances({ as_of_date })` and filter to Asset/Liability/Equity.
- **Block 14 (Cash Flow):** call with `from_date` + `as_of_date` for opening/closing cash account balances.

## Empty-Ledger Behavior

- 0 rows returned — no error.
- `catalogs.accounts` may have rows but if there are no `journal_entry_postings`, the function returns empty.
