# TMS Vendor Write-back to QBO (T11.20.6.2 cut 2)

## Scope

Vendors-only write-back chain:

`mdata.vendors` write -> outbox `tms.vendor.push_requested` -> `TmsVendorPushHandler` -> `push.service.ts` vendor delivery -> `mdata.qbo_vendors` mirror update.

No schema changes in this cut. Items/accounts/invoices are follow-up PR cuts.

## Piece 0 Investigation Summary

- `mdata.vendors` is edited in `apps/backend/src/mdata/vendors.routes.ts` (`POST`, `PATCH`, and deactivation update path).
- Existing outbound QBO push target is `mdata.qbo_vendors`, delivered by `deliverQboMasterEntityPush()` in `apps/backend/src/qbo/push.service.ts`.
- Existing vendor mirror link in TMS row is `mdata.vendors.qbo_vendor_id`.

## Translation Rules (`mdata.vendors` -> `mdata.qbo_vendors`)

- `display_name` <- `vendor_name`
- `company_name` <- `vendor_name`
- `primary_email` <- `email`
- `primary_phone` <- `phone`
- `active` <- `deactivated_at IS NULL`
- `payload_json` merge marker:
  - `source: "mdata.vendors"`
  - `vendor_id: <mdata.vendors.id>`
  - `vendor_type`, `vendor_code` passthrough hints

## Identifier Resolution Rules

Given payload `{ operating_company_id, vendor_id, operation }`:

1. If `mdata.vendors.qbo_vendor_id` exists:
   - Require tenant-scoped `mdata.qbo_vendors` row for that `qbo_id`.
   - Use update path (no create duplication).
2. Else if vendor email is present:
   - Tenant-scoped lookup in `mdata.qbo_vendors` by normalized `primary_email`.
3. Else fallback by normalized `display_name` in tenant:
   - `lower(trim(display_name))` match on existing `qbo_id IS NOT NULL` rows.
4. If no mirror candidate resolves:
   - Insert tenant-scoped TMS-origin mirror row (`qbo_id = NULL`) and push as create.

After push success, handler backfills `mdata.vendors.qbo_vendor_id` from resulting mirror `qbo_id`.

## Tenant Safety Invariants

- Event payload always includes `operating_company_id`.
- Handler derives tenant context from payload and sets `app.operating_company_id`.
- All `mdata.vendors` and `mdata.qbo_vendors` queries include explicit tenant predicates.
- Cross-tenant payloads fail fast with `tms_vendor_missing` (see vitest tenant-isolation test).
