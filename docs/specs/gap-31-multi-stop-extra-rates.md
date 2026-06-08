# GAP-31 - Multi-Stop Extra Rates Per Stop

**Workflow:** WF-053  
**Phase:** GAP-MEDIUM  
**Lane:** B

## Purpose

Support per-stop extra billing amounts on multi-stop loads so accounting can invoice the base linehaul plus stop-level extras without manual edits.

## Data Model

Migration `202606080202_stop_extra_rates.sql` adds `dispatch.stop_extra_rates` with:

- Tenant scope via `operating_company_id`
- Stop and load linkage (`stop_uuid`, `load_uuid`)
- Categorization (`rate_type`)
- Integer cents amount (`amount_cents`)
- Soft-delete marker (`is_active`)
- Back-link to invoice line (`invoice_line_uuid`)

RLS is enabled and enforced with tenant isolation policy and grants for `ih35_app`.

## API

- `POST /api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates`
- `GET /api/v1/dispatch/loads/:load_uuid/extra-rates`
- `DELETE /api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates/:rate_uuid` (soft delete)

## UI

`MultiStopExtraRateEditor` is embedded in `BookLoadStopsSection` to capture extra-rate rows per stop while editing stops.

## Accounting Integration

When `buildInvoiceFromLoad` runs:

1. Linehaul line is created.
2. Active stop extra rates for the load are fetched.
3. Each stop extra is inserted as an `accessorial` invoice line.
4. The created invoice line id is stored back on `dispatch.stop_extra_rates.invoice_line_uuid`.
5. Invoice totals are recomputed.

## Verification

CI guard: `verify:multi-stop-extra-rates`  
Static tests: `apps/backend/src/dispatch/loads/multi-stop/__tests__/extra-rate.test.ts`
