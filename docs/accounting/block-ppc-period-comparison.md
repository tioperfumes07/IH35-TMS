# Block-PPC: Period comparison report

## Scope

Adds period-over-period variance reporting for P&L and Balance Sheet with accrual/cash basis support.

## Shipped

- Backend endpoint:
  - `GET /api/v1/accounting/comparison-report`
  - Query:
    - `operating_company_id`
    - `type=pl|bs`
    - `periods=<period_1>,<period_2>` where period is `YYYY-QN` or `YYYY-MM`
    - `basis=accrual|cash` (optional, defaults to accrual)
  - Response rows include:
    - `account`
    - `period_1_amount`
    - `period_2_amount`
    - `variance_cents`
    - `variance_pct` (null-safe when prior period is zero)
- Reuses existing Block-20 report builders and cash-basis transforms.
- Frontend page:
  - `/accounting/period-comparison`
  - Type/basis/period selectors
  - Two-period table with red/green variance highlighting
  - Drill-through link to posting lineage page
- Added CI guard:
  - `scripts/verify-comparison-respects-basis.mjs`
  - Wired into `verify:arch-design`
- Added service tests:
  - `apps/backend/src/accounting/__tests__/comparison-report.service.test.ts`
