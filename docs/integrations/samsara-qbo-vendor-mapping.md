# Samsara ↔ QBO Vendor Mapping Integrity

## Purpose

CAP-15 adds detection and surfacing for driver-to-vendor mapping integrity.
This is read-only observability to prevent wrong-person payments and catch duplicates.
Auto-link and auto-fix remain out of scope for this contract.

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

## Home Surface

The Office HOME card displays status and counters:
- GREEN: no issues
- YELLOW: unmapped or non-major drift
- RED: duplicate mappings or major drift

Card navigation points to a detail route placeholder for follow-up work.
