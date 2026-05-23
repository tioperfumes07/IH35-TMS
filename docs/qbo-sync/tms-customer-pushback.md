# TMS Customer Write-back to QBO (T11.20.6.2 cut 1)

## Scope

Customers-only write-back chain:

`mdata.customers` write -> outbox `tms.customer.push_requested` -> `TmsCustomerPushHandler` -> `push.service.ts` customer delivery -> `mdata.qbo_customers` mirror update.

No schema changes in this cut. Vendors/items/invoices are follow-up PRs.

## Piece 0 Investigation Summary

- `mdata.customers` is edited in `apps/backend/src/mdata/customers.routes.ts` (`POST`, `PATCH`, and deactivation update path).
- Existing outbound QBO push target is `mdata.qbo_customers`, delivered by `deliverQboMasterEntityPush()` in `apps/backend/src/qbo/push.service.ts`.
- Existing customer mirror link in TMS row is `mdata.customers.qbo_customer_id`.

## Translation Rules (`mdata.customers` -> `mdata.qbo_customers`)

- `display_name` <- `customer_name`
- `company_name` <- `customer_name`
- `primary_email` <- `billing_email`
- `primary_phone` <- `billing_phone`
- `mc_number` <- `mc_number`
- `active` <- `deactivated_at IS NULL` and status not in `inactive|blacklist`
- `payload_json` merge marker:
  - `source: "mdata.customers"`
  - `customer_id: <mdata.customers.id>`

## Identifier Resolution Rules

Given payload `{ operating_company_id, customer_id, operation }`:

1. If `mdata.customers.qbo_customer_id` exists:
   - Require tenant-scoped `mdata.qbo_customers` row for that `qbo_id`.
   - Use update path (no create duplication).
2. Else if `mc_number` is present:
   - Tenant-scoped lookup in `mdata.qbo_customers` by `(operating_company_id, mc_number, qbo_id IS NOT NULL)`.
3. Else fallback by normalized `display_name` in tenant:
   - `lower(trim(display_name))` match on existing `qbo_id IS NOT NULL` rows.
4. If no mirror candidate resolves:
   - Insert tenant-scoped TMS-origin mirror row (`qbo_id = NULL`) and push as create.

After push success, handler backfills `mdata.customers.qbo_customer_id` from resulting mirror `qbo_id`.

## Tenant Safety Invariants

- Event payload always includes `operating_company_id`.
- Handler derives tenant context from payload and sets `app.operating_company_id`.
- All `mdata.customers` and `mdata.qbo_customers` queries include explicit tenant predicates.
- Cross-tenant payloads fail fast with `tms_customer_missing` (see vitest tenant-isolation test).
