# GUARD WORKORDER — MONEY COLUMN VOID-AWARENESS (INV-OPEN-VOID-01)

**Owner:** DEVIN-A (audit + spec + guard)  
**Migration author:** CC-1 (lane HH 00-11, migration authority)  
**Law:** MONEY COLUMN LAW — everywhere money is listed, three columns: TOTAL · OPEN · VARIANCE. OPEN must read 0 on a voided document IN THE DATA, not just in the display.

## Defect

`accounting.invoices.amount_open_cents` is `GENERATED ALWAYS AS (total_cents - amount_paid_cents)`. It has no knowledge of voiding. A voided unpaid invoice stores its full total as open.

**Live evidence (Neon, 2026-09-01):**
- 49 voided invoices total
- 41 carry non-zero `amount_open_cents`
- Phantom open balance: **$72,237.34** (7,223,734 cents)

The register said 33/$45,837.34 — the number has grown since the register was written.

## Same blind spot — two more generated columns

### `accounting.payments.amount_unapplied_cents`
- Generated as: `(amount_cents - amount_applied_cents)`
- Ignores `voided_at`
- **Live evidence:** 11 voided payments, 7 carry phantom unapplied balance totalling **$8,137.25**

### `accounting.vendor_credits.amount_unapplied_cents`
- Generated as: `(amount_cents - amount_applied_cents)`
- Ignores `status = 'voided'` (no `voided_at` column — uses status)
- **Live evidence:** 4 voided vendor credits, 4 carry phantom unapplied balance totalling **$350.00**

## Required schema fix (CC-1 authors the migration)

Drop and recreate each generated column with a void-aware expression:

```sql
-- 1. accounting.invoices.amount_open_cents
ALTER TABLE accounting.invoices DROP COLUMN amount_open_cents;
ALTER TABLE accounting.invoices ADD COLUMN amount_open_cents bigint
  GENERATED ALWAYS AS (
    CASE WHEN voided_at IS NOT NULL THEN 0
         ELSE total_cents - amount_paid_cents END
  ) STORED;

-- 2. accounting.payments.amount_unapplied_cents
ALTER TABLE accounting.payments DROP COLUMN amount_unapplied_cents;
ALTER TABLE accounting.payments ADD COLUMN amount_unapplied_cents bigint
  GENERATED ALWAYS AS (
    CASE WHEN voided_at IS NOT NULL THEN 0
         ELSE amount_cents - amount_applied_cents END
  ) STORED;

-- 3. accounting.vendor_credits.amount_unapplied_cents
ALTER TABLE accounting.vendor_credits DROP COLUMN amount_unapplied_cents;
ALTER TABLE accounting.vendor_credits ADD COLUMN amount_unapplied_cents bigint
  GENERATED ALWAYS AS (
    CASE WHEN status = 'voided' THEN 0
         ELSE amount_cents - amount_applied_cents END
  ) STORED;
```

**NEVER a data patch** — these are generated columns. Dropping and recreating the generated column automatically recomputes all rows.

## Consumer verification (DEVIN-A — all 5 SAFE)

Every consumer of `amount_open_cents` already filters on `voided_at IS NULL` before reading the column:

| # | Consumer | Line | voided_at filter | Status |
|---|----------|------|-----------------|--------|
| 1 | `collections.service.ts` | 134 | `AND i.voided_at IS NULL` (line 139) | SAFE — no DUN risk |
| 2 | `cash-forecast.routes.ts` | 187 | `AND voided_at IS NULL` (line 190) | SAFE |
| 3 | `customers/relationship-score/scorer.service.ts` | 130,134 | `AND i.voided_at IS NULL` (line 140) | SAFE |
| 4 | `reconciliation/ledger-integrity-detectors.service.ts` | 264 | `AND voided_at IS NULL` (line 266) | SAFE |
| 5 | `subledger-gl-control-rec.service.ts` → `ar-aging.service.ts` | 189 | `AND (i.voided_at IS NULL OR i.voided_at::date > $2::date)` (line 124) | SAFE |

The phantom balance exists in the data but is not reaching any consumer that would act on it incorrectly. The UI was masking it (showing $0.00), which is why nobody saw it.

**However:** the schema fix is still required because:
1. Any future consumer that forgets the `voided_at` filter will see phantom money.
2. Direct DB queries (ad-hoc reports, Neon console, BI tools) see the phantom balance.
3. The MONEY COLUMN LAW requires OPEN to read 0 on a voided row IN THE DATA.

## Guard

`scripts/verify-money-column-void-aware.mjs` — static guard that checks:
- The schema-parity baseline tracks all three target tables
- Generation expressions reference the void column (planted-failure selftest)
- Live voided rows with phantom balance are caught (planted-failure selftest)

Named in workflow: money-column-void-aware

## Generated columns NOT affected (audited)

| Table | Column | Expression | Why safe |
|-------|--------|------------|----------|
| `analytics.load_fact` | `total_revenue`, `total_cost`, `margin`, etc. | Sum of components | No void concept at the generated column level |
| `maintenance.severe_repair_estimates` | `estimated_total_cents` | Sum of estimate components | No void concept |
| `maintenance.wo_time_entries` | `duration_minutes`, `computed_labor_cost_cents` | Time-based | No void concept |
| `payroll.driver_settlements` | `net_cents` | `(gross_cents - deductions_cents)` | No `voided_at` column — settlements use status transitions, not void |
| `dispatch.border_crossing_events` | `customs_clearance_minutes` | Time-based | No void concept |
| `dispatch.driver_layovers` | `duration_hours` | Time-based | No void concept |
| `maintenance.internal_labor_log` | `hours`, `labor_cost_cents` | Time-based | No void concept |
| `maintenance.work_orders` | `duration_seconds`, `roadside_response_minutes` | Time-based | No void concept |
| `qbo_archive.transactions_snapshot` | `embezzlement_window` | Boolean | Not a money column |
