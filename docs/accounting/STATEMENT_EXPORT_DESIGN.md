# Statement Export Design (BLOCK 18)

## Scope

This block adds direct-download statement export for the six accounting reports:

- Trial Balance
- Profit & Loss
- Balance Sheet
- Cash Flow
- AR Aging
- AP Aging

Formats in scope:

- PDF
- XLSX

CSV is intentionally deferred for this block.

## Export Endpoints

Per report, two GET-only routes are exposed:

- `/api/v1/accounting/<report-key>/export/pdf`
- `/api/v1/accounting/<report-key>/export/xlsx`

Supported report keys:

- `trial-balance`
- `profit-loss`
- `balance-sheet`
- `cash-flow`
- `ar-aging`
- `ap-aging`

All routes require `operating_company_id`, enforce accounting report roles (`Owner`, `Administrator`, `Manager`, `Accountant`), and are read-only.

## Libraries and Existing Patterns Reused

PDF uses existing `puppeteer` + Handlebars approach, following the same architecture used in:

- `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts`
- `apps/backend/src/dispatch/pdf-generator.service.ts`

XLSX uses existing `xlsx` (SheetJS) approach, consistent with:

- `apps/backend/src/scheduled-reports/report-file-builder.ts`
- `apps/backend/src/integrations/qbo/forensic-report.service.ts`

Implementation files for this block:

- `apps/backend/src/accounting/statement-export.routes.ts`
- `apps/backend/src/accounting/statement-export.service.ts`
- `apps/backend/src/accounting/statement-export-pdf.service.ts`
- `apps/backend/src/accounting/statement-export-xlsx.service.ts`
- `apps/backend/src/accounting/statement-export-range-resolver.ts`
- `apps/backend/src/accounting/export/templates/*.hbs`

## Delivery Pattern (No R2)

Exports are streamed directly in the HTTP response buffer.

Route behavior:

- `Content-Type` set per format
- `Content-Disposition: attachment; filename="..."`
- no R2 upload
- no presigned URLs
- no async generation queue

## Filename Convention

`<company_code>_<report_key>_<period_or_as_of>.<ext>`

Examples:

- `TRANSP_profit-loss_2026-05-01_to_2026-05-31.pdf`
- `TRANSP_balance-sheet_as-of_2026-05-19.pdf`
- `TRANSP_ar-aging_as-of_2026-05-19.xlsx`

Period segment rules:

- Point-in-time reports (Trial Balance, Balance Sheet, AR Aging, AP Aging): `as-of_YYYY-MM-DD`
- Ranged reports (Profit & Loss, Cash Flow): `YYYY-MM-DD_to_YYYY-MM-DD` (or `all-time_to_YYYY-MM-DD` for `all_time`)

## Date-Range Engine Integration

For ranged reports (Profit & Loss, Cash Flow), export supports either:

- explicit `from_date` + `to_date`, or
- `range_key` resolved via BLOCK 17 date-range engine (`this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_year`, `year_to_date`, `last_year`, `all_time`, `custom`)

Point-in-time reports use `as_of_date`.

## Single Definition Rule

Statement export must call existing report services and never re-implement ledger logic:

- Trial Balance -> `getTrialBalanceReport(...)`
- Profit & Loss -> `getProfitLossReport(...)`
- Balance Sheet -> `getBalanceSheetReport(...)`
- Cash Flow -> `getCashFlowReport(...)`
- AR Aging -> `getArAgingReport(...)`
- AP Aging -> `getApAgingReport(...)`

This prevents logic drift between JSON and export surfaces.

## Money Formatting and Integrity Flags

- Source values remain cents from the report services.
- Rendering layer converts to USD with 2 decimals for PDF and XLSX output.
- Integrity status is explicitly rendered (`Balanced: yes/no`, `Reconciled: yes/no`, or `Integrity: not_applicable`).

## Empty-State Behavior

Each report template and XLSX builder emits a valid, downloadable file even when no data rows exist, with a clear `No data` row/message.

## Contract Guard

`scripts/verify-statement-export-contract.mjs` enforces:

- all 12 export routes exist and are GET-only
- attachment content-disposition with filename is present
- export service has no SQL write keywords
- export service does not directly query restricted ledger/invoice/bill tables
- export service calls all six canonical report service functions
- route registration and npm script wiring are present
