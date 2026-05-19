# Accounts Receivable Aging Design (BLOCK 15)

## Definition

Accounts Receivable (AR) Aging reports unpaid customer invoices and buckets each invoice's outstanding balance by overdue age as of a report date.

Buckets:

- `current` (not yet due / due today)
- `d1_30`
- `d31_60`
- `d61_90`
- `d90_plus`

The report is grouped by customer and includes grand totals across all customers.

## Outstanding Balance Rule (Locked)

Outstanding balance is defined only as:

- `accounting.invoices.amount_open_cents`

No fallback or derivation is allowed:

- do not derive from `total_cents - amount_paid_cents`
- do not coalesce with any derived expression

Because `amount_open_cents` is declared nullable, rows with `amount_open_cents IS NULL` are excluded from the report as unknown/uncountable receivable amounts.

## Unpaid-Invoice Gate (Locked)

An invoice is included only when all conditions hold:

- `amount_open_cents IS NOT NULL`
- `amount_open_cents > 0`
- `voided_at IS NULL`
- `status NOT IN ('paid', 'voided', 'draft')`

This excludes fully-paid, voided, draft, and null-balance invoices.

## Customer Join

Customer grouping uses:

- `accounting.invoices.customer_id -> mdata.customers.id`
- display/group name from `mdata.customers.customer_name`

## Aging Math and Buckets

For each included invoice:

- `days_overdue = as_of_date - due_date` (in whole days)

Bucket assignment:

- `current`: `due_date >= as_of_date` (equivalently `days_overdue <= 0`)
- `d1_30`: `1 <= days_overdue <= 30`
- `d31_60`: `31 <= days_overdue <= 60`
- `d61_90`: `61 <= days_overdue <= 90`
- `d90_plus`: `days_overdue >= 91`

Each invoice contributes its full `amount_open_cents` to exactly one bucket.

## Route Contract

`GET /api/v1/accounting/ar-aging`

Query params:

- `operating_company_id` (required)
- `as_of_date` (optional, `YYYY-MM-DD`, defaults to current UTC date)

Response:

- `customers: [{ customer_id, customer_name, current, d1_30, d31_60, d61_90, d90_plus, total_outstanding }]`
- `totals: { current, d1_30, d31_60, d61_90, d90_plus, total_outstanding }`

Derivation rules:

- per-customer `total_outstanding` = sum of that row's five buckets
- grand totals = sum across returned customer rows
- all totals are derived from report rows, never hardcoded

## Empty-State Behavior

When no invoices satisfy the unpaid gate:

- `customers` is `[]`
- every totals field is `0`
