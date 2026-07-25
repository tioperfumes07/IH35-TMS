# Module completion — Lists / Catalogs (Module 12)

**PROGRESS: 5 of 14** · complete: `false` · as_of: 2026-07-25T00:30:00Z · live_sha: `2088757`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 8 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `LST-CAT-01` | **PASS** | Fleet/asset catalogs per-entity (8 tables) | Neon lucia 2026-07-24 br-fancy-credit-akjnd07a: 9/10 fleet catalogs carry operating_company_id AND relforcerowsecurity=true (tractor_statuses, trailer_statuses, asset_condition_codes, equipment_types, unit_ownership_types, trailer_types, lease_terms, asset_statuses, asset_locations); tire_positions global by design. Positive control catalogs.accounts=1392. | 3397 |
| `LST-CAT-02` | **PASS** | equipment_types per-entity + no half-deactivated rows | Neon lucia: half_deactivated (is_active=false AND deactivated_at IS NULL) = 0; each entity 7 total / 5 active / 2 properly deactivated; 0 normalized-code collisions. Repaired by migration 202607911000 (prod ledger 7c44216e, applied 18:16Z). | 3405 |
| `LST-CAT-03` | **PASS** | driver_load_statuses per-entity | Neon lucia: catalogs.driver_load_statuses = 39 rows = 13 x 3 entities; opco present; FORCE RLS true. | 3403 |
| `LST-CAT-04` | **PASS** | driver_termination_reasons per-entity | Neon lucia: 48 rows = 16 x 3 entities (TRANSP/TRK/USMCA each 16 active); opco present; FORCE RLS true. | 3408 |
| `LST-CAT-05` | **PASS** | customer_quality_event_reasons per-entity | Neon lucia: 72 rows = 24 x 3 entities; opco present; FORCE RLS true. | 3409 |
| `LST-CAT-06` | **OPEN** | dispatcher_error_reasons per-entity (load-derived entity) | Neon lucia: 25 rows, NO operating_company_id column; RLS is ROLE-scoped only (der_select_owner_admin / der_modify_owner_only), not entity-scoped. | — |
| `LST-LINK-01` | **FAIL** | Cancel-load writes the canonical per-entity reason FK | Neon lucia: dispatch.load_cancellations has BOTH FKs; reason_code is NOT NULL -> catalogs.cancellation_reasons (legacy, 9 rows, RLS OFF); 36/36 active per-entity codes absent from legacy. cancellation.service.ts:47-80 reads the per-entity catalog and writes only reason_code, never reason_code_id. P0. | — |
| `LST-COUNT-01` | **FAIL** | Lists hub domain badges count every live catalog | 9 live catalogs absent from LISTS_MODULE_COUNT_SPECS + a hardcoded literal 3 for journal_entry_types (real table = 16 rows). Understates TRANSP by 548 active rows, TRK/USMCA by 289 each (Neon lucia counts). | — |
| `LST-COUNT-02` | **FAIL** | No hardcoded list counts anywhere in the count source | lists-module-count-spec.ts:96 ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT=3 added to the live count; Neon lucia catalogs.journal_entry_types=16 all active. Guard scans only 4 frontend files so it cannot see it. | — |
| `LST-A-01` | **FAIL** | Every converted catalog reachable from the Lists hub | driver_load_statuses is mounted at /catalogs/driver-load-statuses and present in catalogs.catalog_registry, but absent from DOMAIN_CONFIG; grep of apps/frontend/src/pages/lists for driver-load-statuses = 0 hits. | — |
| `LST-CAT-07` | **FAIL** | Catalog registry stats/preview support every registered catalog | POST accepts any code matching ^[A-Z][A-Z0-9_]+$ but fetchCatalogStats returns item_count 0 for codes outside a hardcoded 8-entry map and the preview zod enum 400s. Neon lucia: catalog_registry=8 rows (latent today). | — |
| `LST-SEED-01` | **FAIL** | Per-entity catalogs carry the SAME values on every entity | Neon lucia: catalogs.complaint_types active = TRANSP 271 / TRK 12 / USMCA 12. TRK and USMCA each missing ~259 rows. All other converted catalogs are even (dot_violation_types 71/71/71, driver_termination_reasons 16/16/16, load_cancellation_reasons 12/12/12, void_cancel_reasons 6/6/6). | — |
| `LST-RLS-01` | **FAIL** | All catalogs.* carry RLS | Neon lucia pg_class.relrowsecurity=false on catalogs.account_types, catalogs.cancellation_reasons, catalogs.wo_cancellation_reasons. | — |
| `LST-LINK-02` | **FAIL** | Catalogs are referenced (no FK islands) | Neon lucia pg_constraint inbound-FK sweep: 0 inbound FKs on journal_entry_types(16), detail_types(144), dot_violation_types(213), driver_load_statuses(39), cargo_claim_reasons(0), tire_positions(0), wo_cancellation_reasons(6). accounting.journal_entries does not FK journal_entry_types; catalogs.accounts does not FK detail_types. | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/lists.md
