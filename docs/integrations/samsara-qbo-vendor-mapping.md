# Samsara ↔ QBO Vendor Mapping Integrity

## Purpose

CAP-15 adds detection and surfacing for driver-to-vendor mapping integrity.
Resolution actions are now included to prevent wrong-person payments and catch duplicates.

## Integrity Classes

1. `unmapped_drivers`
   - A Samsara driver record has no tenant-valid QBO vendor mapping.
   - Includes cases where:
     - `integrations.samsara_drivers.local_driver_id` is null
     - linked `mdata.drivers` row is missing for tenant
     - `mdata.drivers.qbo_vendor_id` is empty
     - referenced vendor is missing in tenant `mdata.qbo_vendors`

2. `duplicate_mapping`
   - The same `samsara_driver_id` resolves to multiple distinct `qbo_vendor_id` values in tenant `mdata.drivers`.

3. `name_mismatch`
   - Mapping exists but normalized Samsara driver name and QBO vendor name diverge past threshold.
   - Similarity score uses token overlap (Dice coefficient); mismatches are score `< 0.55`.

## Query Plan (Tenant Scope)

Endpoint: `GET /api/v1/samsara/vendor-mapping-integrity?operating_company_id=<uuid>`

Sources:
- `integrations.samsara_drivers sd`
- `mdata.drivers md`
- `mdata.qbo_vendors qv`

Tenant constraints:
- `sd.operating_company_id = :tenant`
- `md.operating_company_id = :tenant`
- `qv.operating_company_id = :tenant`
- join safety in duplicate check:
  - `sd.operating_company_id = md.operating_company_id`

No cross-tenant joins are permitted.

## Resolution Actions

Endpoint family:
- `POST /api/v1/samsara/vendor-mapping/link`
- `POST /api/v1/samsara/vendor-mapping/dedupe`
- `POST /api/v1/samsara/vendor-mapping/confirm-mismatch`

Action behaviors:
1. `link`
   - Input: `{ operating_company_id, samsara_driver_id, qbo_vendor_id }`
   - Effect: resolves tenant vendor and sets `mdata.drivers.qbo_vendor_id` for the mapped Samsara driver.
2. `dedupe`
   - Input: `{ operating_company_id, samsara_driver_id, canonical_qbo_vendor_id, deprecated_qbo_vendor_ids[] }`
   - Effect: rewrites duplicate mappings for the Samsara driver to the canonical vendor in tenant scope.
3. `confirm-mismatch`
   - Input: `{ operating_company_id, samsara_driver_id, qbo_vendor_id }`
   - Effect: records owner acknowledgement that names diverged while mapping remains accepted.

Cross-tenant refusal:
- All mutations require explicit user access to `operating_company_id`.
- Vendor and driver rows are resolved only inside that same tenant.
- Missing tenant access or tenant-mismatched identifiers are rejected.

## Audit Trail Contract

Each resolution action appends an audit record via `audit.append_event` with:
- `event_class='vendor_mapping_resolution'`
- `severity='info'`
- payload keys:
  - `action`
  - `driver_id`
  - `vendor_id`
  - `samsara_driver_id`
  - `actor_user_uuid`
  - `deprecated_vendor_ids` (dedupe only)

## Home Surface

The Office HOME card displays status and counters and links to the resolution detail page:
- GREEN: no issues
- YELLOW: unmapped or non-major drift
- RED: duplicate mappings or major drift
