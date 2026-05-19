# Accounts Payable Aging Design (BLOCK 16)

## Definition

Accounts Payable (AP) Aging reports unpaid vendor bills and buckets each bill's outstanding balance by overdue age as of a report date.

Buckets:

- `current`
- `d1_30`
- `d31_60`
- `d61_90`
- `d90_plus`

The report is grouped by vendor and includes grand totals across all vendors.

## Outstanding Balance Rule (Locked)

Outstanding balance is defined only in integer cents:

- `outstanding_cents = amount_cents - paid_cents`

Constraints:

- use `amount_cents` and `paid_cents` only
- do not use `total_amount` or `paid_amount` (numeric dollar columns)
- do not mix cents and dollars

Because `amount_cents` is nullable, rows with `amount_cents IS NULL` are excluded as unknown totals.
No fallback derivation from dollar columns is allowed.

## Unpaid-Bill Gate (Locked)

A bill is included only when all conditions hold:

- `amount_cents IS NOT NULL`
- `(amount_cents - paid_cents) > 0`
- `revoked_at IS NULL`
- `status NOT IN ('paid', 'voided', 'draft')`

This excludes fully-paid, voided/revoked, draft, and null-total bills.

## Vendor Join (Defensive)

Join basis (naming-based inference, no FK exists):

- `accounting.bills.vendor_uuid` (text) -> `mdata.vendors.id` (uuid)

Discovery found no foreign key from `accounting.bills` to `mdata.vendors`, so this join is intentionally defensive.

Implementation behavior:

- left join using safe UUID cast only when `vendor_uuid` matches UUID shape
- invalid/NULL `vendor_uuid` must not error and must not drop the bill
- unmatched rows are grouped under:
  - `vendor_id = null`
  - `vendor_name = 'Unknown Vendor'`

## Due Date Rule (Locked)

`due_date` is nullable on bills.

- if `due_date IS NULL`, classify as `current`
- otherwise compute overdue days from `as_of_date - due_date`

## Aging Math and Buckets

For each included bill:

- `days_overdue = as_of_date - due_date` (whole days)

Bucket assignment:

- `current`: `due_date IS NULL` OR `due_date >= as_of_date` (equivalently `days_overdue <= 0`)
- `d1_30`: `1 <= days_overdue <= 30`
- `d31_60`: `31 <= days_overdue <= 60`
- `d61_90`: `61 <= days_overdue <= 90`
- `d90_plus`: `days_overdue >= 91`

Each bill contributes its full derived outstanding amount to exactly one bucket.

## Route Contract

`GET /api/v1/accounting/ap-aging`

Query params:

- `operating_company_id` (required)
- `as_of_date` (optional, `YYYY-MM-DD`, defaults to current UTC date)

Response:

- `vendors: [{ vendor_id, vendor_name, current, d1_30, d31_60, d61_90, d90_plus, total_outstanding }]`
- `totals: { current, d1_30, d31_60, d61_90, d90_plus, total_outstanding }`

Derivation rules:

- per-vendor `total_outstanding` = sum of that row's five buckets
- grand totals = sum across returned vendor rows
- all totals are derived from report rows, never hardcoded

## Empty-State Behavior

When no bills satisfy the unpaid gate:

- `vendors` is `[]`
- every totals field is `0`
