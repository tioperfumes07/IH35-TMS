# IH35-TMS required-documents matrix

The regulatory-default catalog seeded into `compliance.required_document_types` for every carrier
(migration `202607021400_required_document_types.sql`). One row per `(operating_company_id, entity_kind,
code)`. `enforcement` defaults to `warn`; a carrier may promote any row to `hard_block`. `has_expiry`
drives the renewal clock. New carriers inherit these via the bootstrap hook. **Additive only** — extend
by seed, never remove a seeded requirement.

## driver
| code | label | authority | has_expiry | how the resolver verifies presence |
|---|---|---|---|---|
| `cdl` | Commercial Driver License | FMCSA §383 | yes | `mdata.drivers.cdl_number` present + `cdl_expires_at` not past |
| `med_cert` | DOT Medical Certificate | FMCSA §391.41 | yes | `safety.medical_cards` non-voided, `expiry_date` ≥ today |
| `mvr` | Motor Vehicle Record | FMCSA §391.25 | yes | `safety.driver_documents` `doc_type='mvr'` non-expired |
| `clearinghouse` | Drug & Alcohol Clearinghouse | FMCSA §382.701 | yes | `safety.clearinghouse_query` `query_status='clear'`, not expired |
| `driver_application` | Driver Employment Application | FMCSA §391.21 | no | `safety.driver_documents` `doc_type='driver_application'` |
| `w9` | Form W-9 (or W-8BEN if foreign) | IRS | no | `safety.driver_w8ben` (non-expired) **OR** `docs.files` category `tax_form` |

## unit
| code | label | authority | has_expiry | how the resolver verifies presence |
|---|---|---|---|---|
| `registration` | Vehicle Registration (cab card) | State DMV | yes | `mdata.units.irp_expiration` ≥ today |
| `annual_inspection` | Annual DOT Inspection | FMCSA §396.17 | yes | `maintenance.inspections` `annual_dot`, `completed`+`pass`, within 1 year |
| `ifta` | IFTA License / Decal | IFTA | yes | `safety.permits` `ifta_sticker` non-expired |
| `form_2290` | Form 2290 (HVUT) Schedule 1 | IRS Form 2290 | yes | `compliance.form_2290_filing_vehicles` → `filings` `accepted`, current tax period |
| `insurance` | Insurance / Cab-card proof | State / FMCSA | yes | `insurance.policy_unit` → active `insurance.policy` covering today |

> `mdata.units` has **no** `operating_company_id`; the unit query scopes by `u.id` and each subquery scopes
> its own table by the opco/tenant. Do not add an `operating_company_id` predicate to the units row itself.

## customer
| code | label | authority | has_expiry | verification |
|---|---|---|---|---|
| `credit_app` | Credit Application | — | no | **needs_manual** (shares coarse `legal_doc` category) |
| `w9` | Form W-9 | IRS | no | `docs.files` category `tax_form` |
| `msa` | Master Service Agreement | — | no | **needs_manual** |
| `noa` | Notice of Assignment (if factored) | — | no | **needs_manual** |

## vendor
| code | label | authority | has_expiry | verification |
|---|---|---|---|---|
| `w9` | Form W-9 | IRS | no | `docs.files` category `tax_form` |
| `coi` | Certificate of Insurance | — | yes | `docs.files` category `insurance_policy`, non-expired |
| `agreement` | Vendor / Carrier Agreement | — | no | **needs_manual** |

### needs_manual
`customer` {`msa`,`noa`,`credit_app`} and `vendor` {`agreement`} cannot be auto-verified: they share the
coarse `docs.files` `legal_doc` category, so one legal-doc upload would false-green all of them. The resolver
surfaces them as `satisfied=false, needs_manual=true` (shown as missing until finer doc-typing exists — an
open owner decision). **Never false-green a needs_manual code.**
