# Block-21: Expense category -> account map

## Piece 0 investigation findings

### Existing chart-of-accounts layout

- Canonical table in repo: `catalogs.accounts` (created in `db/migrations/0010_catalogs_init.sql`).
- Relevant columns: `id`, `account_number`, `account_name`, `account_type`, `account_subtype`, `is_postable`, `deactivated_at`.
- There is no physical `accounting.chart_of_accounts` table in current migration chain; `chart_of_accounts` appears as a catalog entity label in list/sync metadata.

### Existing expense category sources in use

- **General accounting categories**
  - `catalogs.expense_categories` (company-scoped, code/display_name; surfaced in Accounting Lists).
  - `accounting.bill_lines.expense_category_uuid` and `accounting.expense_lines.expense_category_uuid` reference category rows.
- **Fuel-related category surfaces**
  - Company-scoped fuel catalogs: `catalogs.fuel_card_types`, `catalogs.fuel_exception_types`, `catalogs.fuel_stop_reason_codes`, `catalogs.fuel_grades`, `catalogs.fuel_brands`.
  - Existing line-level expense categorization logic in `maintenance/two-section-service.ts` infers: `diesel`, `toll`, `scale`, `lumper`, `parking`, `roadside_repair`.
- **Maintenance-related category surfaces**
  - Company-scoped maintenance catalogs: `catalogs.maintenance_failure_codes`, `catalogs.maintenance_labor_codes`, `catalogs.maintenance_service_tasks`, `catalogs.maintenance_parts`.
- **Driver pay / escrow category surfaces**
  - Company-scoped driver catalogs: `catalogs.driver_pay_types` and `catalogs.escrow_types`.
- **Factoring fee category surfaces**
  - No dedicated factoring fee category catalog exists yet; factoring records carry fee amounts (`factor_fee_pct`, `factor_fee_cents`) on `accounting.factoring_advances`.
  - Block-21 keeps `category_code` free-text for `factoring_fee` to support deterministic mapping before a dedicated fee-code catalog exists.

### Category kinds mapped by Block-21 table

- `fuel`
- `maintenance`
- `driver_pay`
- `factoring_fee`
- `toll`
- `escrow`
- `insurance`
- `office`
- `other`
