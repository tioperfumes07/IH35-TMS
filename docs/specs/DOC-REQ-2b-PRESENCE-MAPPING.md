# DOC-REQ-2b — "Missing required: N" presence mapping (DRAFT → GUARD prod-verify → owner approve)

**Status:** DRAFT. This is the per-code→storage mapping the `resolveMissingRequired` resolver needs. Per owner
ruling (2026-07-02): **GUARD live-verifies every target against prod first** (table exists, is the *operative*
store the UI writes to, row counts sane), THEN the owner approves a **verified** mapping — never a plausible
one. A compliance chip that lies is worse than none, so nothing below is built until each row is confirmed.

Catalog: `compliance.required_document_types (operating_company_id, entity_kind, code)` (migration
`202607021400`). Resolver: for each active required code, is it satisfied for entity X?

---

## Resolver model
Two satisfaction sources, in order:
1. **Structured credential** — a purpose-built table with the expiry/status the compliance dashboard already
   tracks (preferred: gives real currency, not just "a file exists").
2. **Generic document store fallback** — `docs.files` + `docs.file_links` (polymorphic) via a category
   crosswalk, for codes with no structured table (an uploaded document = satisfied).

### Generic `docs.files` presence pattern (migration `0028_docs_schema.sql`)
```sql
EXISTS (
  SELECT 1 FROM docs.file_links fl
  JOIN docs.files f ON f.id = fl.file_id
  JOIN catalogs.file_categories c ON c.id = f.category_id
  WHERE fl.entity_type = $kind AND fl.entity_id = $entityId
    AND fl.deleted_at IS NULL AND f.deleted_at IS NULL
    AND f.upload_completed_at IS NOT NULL          -- ignore in-progress uploads (0028:101)
    AND c.code = $categoryCode
)
```
`docs.file_links.entity_type ∈ ('driver','customer','vendor','unit','equipment','load','settlement','invoice')`.

### REQUIRED crosswalk — `required_document_types.code` → `catalogs.file_categories.code`
They **diverge** — the resolver needs an explicit map (GUARD: confirm each `file_categories.code` exists in prod):
| required code | file_categories.code (candidate) |
|---|---|
| cdl | `cdl` |
| med_cert | `medical_card` |
| w9 (any) | `tax_form` |
| insurance | `insurance_policy` |
| registration | `permit` or `other` |
| driver_application, credit_app, msa, noa, agreement | `legal_doc` / `other` |

---

## Mapping table (DRAFT — confidence + what GUARD must verify)

### Drivers (link column → `mdata.drivers.id`)
| code | resolver rule | conf | GUARD must verify on prod |
|---|---|---|---|
| **cdl** | STRUCTURED: `mdata.drivers.cdl_number IS NOT NULL`; currency `cdl_expires_at` | STRONG | cols exist + populated on real drivers (row counts non-trivial) |
| **med_cert** | STRUCTURED: `safety.medical_cards` row for driver, `voided_at IS NULL`, `expiry_date` | STRONG | table is the operative store the UI writes to; sane row count |
| **clearinghouse** | STRUCTURED: `safety.clearinghouse_query` latest for driver, `voided_at IS NULL`, `queried_at`/`expires_at` (annual) | STRONG | confirm `safety.clearinghouse_query` (not the `compliance.*` drug/alcohol cluster) is operative |
| **mvr** | FALLBACK: `docs.files` (driver) — **no structured table** | UNCLEAR | **owner decision:** accept docs.files, or add a structured MVR record? |
| **driver_application** | FALLBACK: `docs.files` (driver). (Pre-hire lives in `identity.applicant_documents` via `driver_applicants.converted_driver_id` — multi-hop, not for active drivers) | WEAK | confirm active-driver apps land in docs.files, not only applicant_documents |
| **w9** | STRUCTURED (foreign): `safety.driver_w8ben` row, `voided_at IS NULL`. Domestic: `docs.files` cat `tax_form`. **W-9 OR W-8BEN = ONE satisfied slot** keyed on the driver's foreign_status | STRONG (W-8BEN) / UNCLEAR (W-9) | confirm foreign_status flag drives which slot; W-9 has no structured store |

### Units (link column → `mdata.units.id`, EXCEPT insurance)
| code | resolver rule | conf | GUARD must verify on prod |
|---|---|---|---|
| **annual_inspection** | STRUCTURED: `maintenance.inspections` `unit_id`, `inspection_type='annual_dot'`, `outcome='pass'`, `status='completed'`; currency `inspection_date` | STRONG | `inspection_type` enum has `annual_dot`; this (not the roadside `dot_inspection` cluster) is §396.17 |
| **form_2290** | STRUCTURED: `compliance.form_2290_filing_vehicles.vehicle_id=$unit` joined to `form_2290_filings.filing_status='accepted'`, current tax period | STRONG | `vehicle_id` links to `mdata.units.id`; `filing_status` values |
| **insurance** | STRUCTURED: `insurance.policy_unit.asset_id` (⚠ **asset_id, map unit→asset**) → `insurance.policy` active + `expiry_date >= today` | STRONG | the unit→asset mapping (how `mdata.units` relates to `mdata.assets`); policy active-status column |
| **ifta** | FALLBACK: `safety.permits` `permit_type='ifta_sticker'`, `archived_at IS NULL`, `expiry_date` (the `ifta.*` schema is FILINGS, not the decal credential) | WEAK | confirm `permit_type` enum has `ifta_sticker` + is used, or accept docs.files |
| **registration** | FALLBACK: `docs.files` (unit) cab-card — `mdata.units.license_plate` exists but no expiry/cab-card col | WEAK | **owner decision:** docs.files cab-card upload = satisfied? |

### Customers (link column → `mdata.customers.id`)
| code | resolver rule | conf | GUARD must verify on prod |
|---|---|---|---|
| **msa** | STRUCTURED: `customer.contract` `contract_type='master_service'`, `customer_id`, `is_active=true` | STRONG | `contract_type` values; operative store |
| **noa** | CONDITIONAL: required ONLY if `factoring.customer_factor_assignment` active (`effective_to IS NULL`) for the customer; document via `docs.files` (customer) | UNCLEAR | confirm the factoring-assignment gate table + how "active" is expressed |
| **credit_app** | FALLBACK: `docs.files` (customer) — no structured table | UNCLEAR | owner decision: docs.files acceptable? |
| **w9** | FALLBACK: `docs.files` cat `tax_form` (customer) | UNCLEAR | — |

### Vendors (link column → `mdata.vendors.id`)
| code | resolver rule | conf | GUARD must verify on prod |
|---|---|---|---|
| **w9** | FALLBACK: `docs.files` cat `tax_form` (vendor) | UNCLEAR | — |
| **coi** | FALLBACK: `docs.files` cat `insurance_policy` (vendor). ⚠ **NOT `insurance.coi_request`** — that table is customer-scoped (carrier issuing a COI to a customer), not a vendor's COI on file | WEAK | confirm the naming trap; `file_categories.insurance_policy.applies_to` includes vendor |
| **agreement** | FALLBACK: `docs.files` cat `legal_doc` (vendor) — no vendor-contract table (`customer.contract` is customer-only) | WEAK | owner decision: docs.files acceptable? |

---

## Owner decisions this surfaces (the UNCLEAR/WEAK rows)
Six codes have **no structured store** and resolve only via `docs.files`: **mvr, registration, credit_app,
w9 (customer/vendor/domestic-driver), noa-document, coi (vendor), agreement (vendor)**. For each, the owner
confirms EITHER "an uploaded document in docs.files satisfies it" OR "build a structured record" (bigger).
Recommendation: **docs.files fallback is acceptable for all of them for v1** — it turns "missing required"
into truth (a document is or isn't on file); structured currency tracking can come later per-code.

## Traps GUARD must confirm before build
1. `insurance.policy_unit` links by **`asset_id`, not `unit_id`** — the resolver needs the unit→asset map.
2. `insurance.coi_request` is **customer-scoped** — do NOT use it for vendor COI.
3. `required_document_types.code` ≠ `catalogs.file_categories.code` — the crosswalk above must be exact.
4. `safety.clearinghouse_query` vs the newer `compliance.*` drug/alcohol cluster — confirm which is operative.
5. Every structured presence check must exclude soft-deleted/voided rows (`voided_at`/`archived_at`/`deleted_at`).

## After GUARD verifies + owner approves
Build **DOC-REQ-2b**: a read-only `resolveMissingRequired(entity_kind, entity_id, opco)` service implementing
the confirmed map, + the "Missing required: N" chip on the driver/unit/customer/vendor surfaces + a CI guard
pinning the code→store map so a wrong mapping can't silently regress. No writes; entity-scoped.
