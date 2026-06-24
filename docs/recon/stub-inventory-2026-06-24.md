# Stub Inventory — Pass 4 (EMPTY-COLUMN / STUB INVENTORY)

**Date:** 2026-06-24
**Scope:** office frontend `apps/frontend` + the catalog backend (`apps/backend/src/catalogs`, `…/lists`). Separates "done" from "façade": for every screen, the fields/columns that RENDER but have NO backing data (the invented-column trap), and which reference catalogs/lists are real vs stub.
**Method:** frontend column/field render → trace to API type → backend route → SQL `FROM` / hardcoded array. Catalog map cross-checked against `db/migrations/` (tables created in PL/pgSQL `FOREACH … CREATE TABLE IF NOT EXISTS catalogs.%I` loops, not only literal `CREATE TABLE`).
**Constraint:** READ-ONLY recon. No code edits, no commits, no PRs. Findings only.

**Verdict legend:** `SILENT-STUB` = renders a value but no source (hardcoded literal / field not in API type), no note — the real façade risk · `DEFERRED(ok)` = a code comment says deferred / explicit empty-state / guard DEFERRED entry — acceptable · `READ-ONLY-LIST` = real table, GET-only (write → 405) — semi-stub by design · `IN-PREP` = UI tile explicitly marked "In preparation" (honest).
**Severity:** HIGH = looks built, drives a decision, no data (money/status/KPI column on a LIVE page) · MED = secondary attribute field unwired on a live page · LOW = cosmetic, or on confirmed dead code.

---

## HEADLINE FINDINGS

1. **Catalog hub tile COUNTS are fake (QBO-mirror, not live).** `views.catalogs_inventory` (`db/migrations/0055_p3_t11_14_lists_hub.sql:15`; canonicalized `0201_ds_remediate_qbo_remote_counts_canonical.sql:179`) computes every catalog's `row_count` as `COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key='catalog.X'),0)` — i.e. from the **QBO remote-mirror count table**, NOT a `count(*)` of the local `catalogs.X` table. Any catalog with no `qbo_remote_counts` row shows **0** even when fully seeded. The per-tile list PAGES query the real tables (live and correct); only the **All-Catalogs hub inventory counts are decoupled from reality**. Severity: **HIGH** (a count that looks like real inventory but reflects a QBO mirror). Consumed by `apps/frontend/src/pages/lists/components/DomainRibbon.tsx` via `getListsInventory` → `apps/backend/src/lists/lists-hub.routes.ts:38`.

2. **The "invented TMS columns" trap on LIVE financial detail panels.** Customer and Vendor detail panels render user-toggleable TMS custom-field columns (Settlement No, Truck No, Pickup/Delivery Date, Loaded Miles — the exact fields CLAUDE.md §7 says to KEEP) as hardcoded `"—"`. They present as selectable real data but are never populated. `apps/frontend/src/pages/Vendors.tsx:391-396` and `apps/frontend/src/pages/Customers.tsx:480-484`. Severity: **HIGH**. NOTE: these sit on customer/vendor MONEY panels — per CLAUDE.md §1, wiring them is a financial-page change → STOP for Jorge before touching.

3. **Catalog tiles are overwhelmingly REAL.** The earlier "~34/65 catalogs are STUB" estimate is stale. Of 61 tiles in the live `AllCatalogsMap`, **54 are REAL (CRUD route + existing table)**, 2 READ-ONLY-LIST (by design), **1 true STUB** (Journal Entry Types — hardcoded array, no table), and 4 IN-PREP (honestly marked). The catalog backlog is much closer to done than the headline suggested — the façade risk has moved from "empty catalogs" to "fake hub counts" + "invented detail columns."

---

## TABLE A — Screen → rendered-but-unwired field

| Screen / Page (LIVE unless noted) | Field / Column | file:line | Verdict | Severity | Why |
|---|---|---|---|---|---|
| Lists Hub — All-Catalogs map tile counts | per-catalog `row_count` | `lists-hub.routes.ts:38` → `views.catalogs_inventory` (`0055:15` / `0201:179`) | SILENT-STUB | **HIGH** | Count read from `accounting.qbo_remote_counts` (QBO mirror), not local `catalogs.X count(*)`; shows 0 / stale for seeded catalogs. |
| Vendors detail — customer-bills table | `load_no`, `settlement_no`, `truck_no`, `pickup_date`, `delivery_date`, `loaded_miles` | `Vendors.tsx:391-396` | SILENT-STUB | **HIGH** | All 6 hardcoded `"—"` in the row `values` map regardless of `bill`; toggleable `COLUMN_OPTIONS` so they present as real selectable columns; `VendorBill` type has none of these fields. Financial panel. |
| Customers detail — invoice table | `settlement_no`, `truck_no`, `pickup_date`, `delivery_date`, `loaded_miles` | `Customers.tsx:480-484` | SILENT-STUB | **HIGH** | Hardcoded `"—"` unconditionally; toggleable columns; `Invoice` type lacks these. (`load_no` IS wired via `source_load_id ?? "—"` at :479 — fine.) Financial panel. |
| Lists — Accounting · Journal Entry Types | entire catalog (rows, `created_at`/`updated_at`, count) | backend `catalogs/accounting/factory.ts:426-460` (`registerJournalEntryTypesReadOnlyRoutes`) | SILENT-STUB | MED | GET serves a HARDCODED 3-row in-file `const rows` with fixed UUIDs + epoch timestamps; no `catalogs.journal_entry_types` table; writes → 405. Presents as a catalog with a count and "rows" but is code-baked. (Adjacent to read-only-by-design pattern, but unlike Posting Templates it has NO table at all.) |
| Vendors detail panel | "Shipping address:" | `Vendors.tsx:305` | SILENT-STUB | MED | Literal `—`, unconditional; `VendorOption` type has only `address` (billing), no shipping field. |
| Vendors detail panel | "Custom fields:" | `Vendors.tsx:307` | SILENT-STUB | MED | Literal `—`; no `custom_fields` on the type. |
| Customers detail panel | "Shipping address:" | `Customers.tsx:389` | SILENT-STUB | MED | Literal `—`; `Customer` type has `billing_address` only. |
| Customers detail panel | "Custom fields:" | `Customers.tsx:391` | SILENT-STUB | MED | Literal `—`; no `custom_fields` on the type. |
| Profitability KPI strip (DEAD module — not in `routes/manifest.tsx`) | Total Revenue, Total Miles, Avg Rev/Mi, Avg Cost/Mi, Avg Margin/Mi, Loads | `pages/profitability/KpiStrip.tsx:13,17,21,25,29,33` | SILENT-STUB | MED | All 6 money/metric KPIs hardcoded `-`; component makes NO API call, ignores `filters`. Only spared HIGH because the whole `pages/profitability/*` module is unrouted (live profit reports = `reports/CustomerProfitabilityPage.tsx` + `reports/LaneProfitabilityPage.tsx`, both wired). |
| Profitability By-Lane / By-Type / By-Customer / By-Load (DEAD) | Loads / Miles / Rev-Mi / Cost-Mi / Margin-Mi / Total Margin | `pages/profitability/ByLaneView.tsx:33-38`, `ByTypeView.tsx:31-37`, `ByCustomerView.tsx:31-37`, `ByLoadView.tsx:33-39` | SILENT-STUB | LOW | One hardcoded `-` row each + "No data" copy; no fetch. Orphaned module — recommend archive so it can't be accidentally routed. |
| Dispatch `LoadTable` (DEAD — imported nowhere; live board = `DispatchBoard.tsx`) | "WO" column | `pages/dispatch/components/LoadTable.tsx:154` | SILENT-STUB | LOW | Hardcoded amber `—`; no accessor. Confirms "merged-not-live" memory note. |
| Dispatch `LoadTable` (DEAD) | "Temp" column | `pages/dispatch/components/LoadTable.tsx:155` | SILENT-STUB | LOW | Hardcoded `"dry"` unconditionally; no accessor. Dead code. |
| Maintenance Damage Register (LIVE) | "Type" column | `pages/maintenance/components/MaintenanceDamageRegisterTab.tsx:79` | DEFERRED(ok) / borderline | LOW | `render: () => "Damage report"` ignores `row.incident_type`, but the tab is pre-filtered to `incident_type='damage_report'`, so the constant is correct-by-construction. Cosmetic. |
| Maintenance Arriving Soon (LIVE) | "Prep" / WO-link column | `pages/maintenance/ArrivingSoonPage.tsx:154-157` | **DEFERRED(ok)** | — | Explicit comment: column intentionally omitted because issues are pre-conversion (`promoted_to_wo_id IS NULL`). Not faked. |
| Maintenance Damage Register (LIVE) | "Linked WO" column | `pages/maintenance/components/MaintenanceDamageRegisterTab.tsx:54-56,86` | **DEFERRED(ok)** | — | Explicit comment: `safety.incidents` has no work_order link column (gated migration later); column omitted, not faked. |

> **Excluded as legitimate (not stubs):** the bulk of `>—<` hits across dispatch/driver/banking/fleet (e.g. `CargoTempBadge`, `InTransitEtaChip`, `DriverHosClocks`, `AbandonmentQueuePage:79`, `TripPairingBoardPage`) are conditional null-guards / empty-states (`if (!x) return —`) on genuinely-nullable fields, not invented columns. Form input `placeholder` attributes and "no rows" empty states are also excluded.
>
> **NEEDS-VERIFY carry-over from Pass 3 (not re-traced here):** Safety `DrugAlcohol`, `Insurance`, `SafetyMeetings`, `External/Internal Fines` tabs were not traced to a backend `FROM` clause; confirm before declaring their detail fields wired.

---

## TABLE B — Catalog → real / stub (live `AllCatalogsMap` tiles)

Route prefixes: fleet=`/api/v1/catalogs/fleet/*`, fuel=`/api/v1/catalogs/fuel/*`, driver=`/api/v1/catalogs/driver/*`, maintenance=`/api/v1/catalogs/maintenance/*`, accounting=`/api/v1/catalogs/accounting/*`, dispatch/misc=`/api/v1/catalogs/*`, drivers-reference=`/api/v1/lists/drivers/*`. Map source: `apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx` `DOMAIN_CONFIG`.

| Domain | Tile | catalogKey | Class | Backend route | Table (or none) |
|---|---|---|---|---|---|
| safety | Internal Fine Reasons | internal-fine-reasons | REAL | safety/index.ts:10 | catalogs.internal_fine_reasons (0050) |
| safety | Civil Fine Types | civil-fine-types | REAL | safety/index.ts:11 | catalogs.civil_fine_types (0062) |
| safety | Company Violation Types | company-violation-types | REAL | safety/index.ts:12 | catalogs.company_violation_types (0050) |
| safety | Complaint Types | complaint-types | REAL | safety/index.ts:13 | catalogs.complaint_types (0050) |
| safety | DOT Violation Types | dot-violation-types | REAL | safety/index.ts:14 | catalogs.dot_violation_types (202606211200) |
| safety | Cargo Claim Reasons | cargo-claim-reasons | REAL | safety/index.ts:15 | catalogs.cargo_claim_reasons (202606211300) |
| dispatch | Load Types | load-types | REAL | dispatch/index.ts:8 → shared.ts:188 | catalogs.load_types (0062) |
| dispatch | Detention Reasons | detention-reasons | REAL | dispatch/index.ts:9 | catalogs.detention_reasons (0062) |
| dispatch | Pickup Time Types | pickup-time-types | REAL | dispatch/index.ts:10 | catalogs.pickup_time_types (0062) |
| dispatch | Additional Charges | additional-charges | REAL | dispatch/index.ts:11 | catalogs.additional_charges (0062) |
| dispatch | Load Cancellation Reasons | load-cancellation-reasons | REAL | load-cancellation-reasons.routes.ts:132 | catalogs.load_cancellation_reasons (0035) |
| drivers | Pay Rate Templates | pay-rate-templates | REAL | driver/index.ts:5 | catalogs.pay_rate_templates (0062) |
| drivers | Driver Deduction Types | deduction-types | REAL | driver/index.ts:13 | catalogs.driver_deduction_types (0062) |
| drivers | Driver Pay Types | pay-types | REAL | driver/index.ts:21 | catalogs.driver_pay_types (0062) |
| drivers | Escrow Types | escrow-types | REAL | driver/index.ts:29 | catalogs.escrow_types (0062) |
| drivers | License Classes | license-classes | REAL | lists/drivers-reference.routes.ts | reference.license_classes (0340) |
| drivers | CDL Endorsements | endorsements | REAL | drivers-reference.routes.ts | reference.cdl_endorsements (0340) |
| drivers | CDL Restrictions | restrictions | REAL | drivers-reference.routes.ts | reference.cdl_restrictions (0340) |
| drivers | Medical Card Status | medical-card-status | REAL | drivers-reference.routes.ts | reference.medical_card_statuses (0340) |
| drivers | Employment Status | employment-status | REAL | drivers-reference.routes.ts | reference.employment_statuses (0340) |
| drivers | Termination Reasons | termination-reasons | REAL | mdata/driver-safety-events.routes.ts:83 | catalogs.driver_termination_reasons |
| maintenance | Failure Codes | failure-codes | REAL | maintenance/index.ts:5 | catalogs.maintenance_failure_codes (0066) |
| maintenance | Labor Codes | labor-codes | REAL | maintenance/index.ts:13 | catalogs.maintenance_labor_codes (0066) |
| maintenance | Parts | parts | REAL | maintenance/index.ts:21 | catalogs.maintenance_parts (0066) |
| maintenance | OEM Parts Reference | oem-parts-reference | REAL | lists/oem-parts.routes.ts:73 | reference.oem_parts (0342) |
| maintenance | Priority Levels | priority-levels | REAL | maintenance/index.ts:29 | catalogs.maintenance_priority_levels (0066) |
| maintenance | Service Tasks | service-tasks | REAL | maintenance/index.ts:37 | catalogs.maintenance_service_tasks (0066) |
| maintenance | Shop Locations | shop-locations | REAL | maintenance/index.ts:45 | catalogs.maintenance_shop_locations (0066) |
| maintenance | Vendors | vendors | REAL | maintenance/index.ts:53 | catalogs.maintenance_vendors (0066) |
| maintenance | Work Order Statuses | work-order-statuses | REAL | maintenance/index.ts:61 | catalogs.work_order_statuses (0066) |
| fuel | Card Types | card-types | REAL | fuel/index.ts:5 | catalogs.fuel_card_types (0067) |
| fuel | Exception Types | exception-types | REAL | fuel/index.ts:13 | catalogs.fuel_exception_types (0067) |
| fuel | Station Brands | station-brands | REAL | fuel/index.ts:21 | catalogs.fuel_station_brands (0067) |
| fuel | Stop Reason Codes | stop-reason-codes | REAL | fuel/index.ts:29 | catalogs.fuel_stop_reason_codes (0067) |
| fuel | MPG Bands | mpg-bands | REAL | fuel/index.ts:37 | catalogs.mpg_bands (0067) |
| fuel | Expensive States | expensive-states | REAL | fuel/index.ts:45 | catalogs.expensive_states (0062) |
| fuel | Tax Jurisdictions | tax-jurisdictions | REAL | fuel/index.ts:53 | catalogs.fuel_tax_jurisdictions (0067) |
| fuel | Brands | brands | REAL | fuel/index.ts:61 | catalogs.fuel_brands (0062/0155) |
| fuel | Station States | station-states | REAL | fuel/index.ts:69 | catalogs.fuel_station_states (0062/0155) |
| fuel | Pump Types | pump-types | REAL | fuel/index.ts:77 | catalogs.fuel_pump_types (0062/0155) |
| fuel | Grades | grades | REAL | fuel/index.ts:85 | catalogs.fuel_grades (0062/0155; 0151 bug repaired by 0155) |
| fuel | Dispatch Routes | dispatch-routes | REAL | fuel/index.ts:93 | catalogs.fuel_dispatch_routes (0062/0155) |
| fleet | Tractor Statuses | tractor-statuses | REAL | fleet/index.ts:7 | catalogs.tractor_statuses (0068) |
| fleet | Trailer Statuses | trailer-statuses | REAL | fleet/index.ts:15 | catalogs.trailer_statuses (0068) |
| fleet | Condition Codes | condition-codes | REAL | fleet/index.ts:23 | catalogs.asset_condition_codes (0068) |
| fleet | Equipment Types | equipment-types | REAL | fleet/index.ts:31 | catalogs.equipment_types (0017) |
| fleet | Tire Positions | tire-positions | REAL | fleet/tire-positions.routes.ts | catalogs.tire_positions (0068) |
| fleet | Ownership Types | ownership-types | REAL | fleet/index.ts:39 | catalogs.unit_ownership_types (0068) |
| fleet | Trailer Types | trailer-types | REAL | fleet/index.ts:47 | catalogs.trailer_types (0153) |
| fleet | Lease Terms | lease-terms | REAL | fleet/index.ts:55 | catalogs.lease_terms (0153) |
| fleet | Asset Statuses | asset-statuses | REAL | fleet/index.ts:63 | catalogs.asset_statuses (0153) |
| fleet | Asset Locations | asset-locations | REAL | fleet/index.ts:71 | catalogs.asset_locations (0153) |
| accounting | Chart of Accounts | chart-of-accounts | REAL (financial) | accounting/index.ts:14 | catalogs.accounts (0010) |
| accounting | Classes | classes | REAL | accounting/index.ts:67 | catalogs.classes (0010) |
| accounting | Payment Terms | payment-terms | REAL | accounting/index.ts:85 | catalogs.payment_terms (0010) |
| accounting | Posting Templates | posting-templates | READ-ONLY-LIST | accounting/index.ts:175 (readOnly) | catalogs.posting_templates (0010) — GET only; writes 405 "code-managed" |
| accounting | **Journal Entry Types** | journal-entry-types | **STUB** | factory.ts:424-466 | **NONE** — GET serves hardcoded in-file `const rows`; writes 405 |
| accounting | QBO bulk-link | qbo-bulk-link | REAL (tool) | /api/v1/qbo/unlinked-entities + /qbo/bulk-link | mdata.drivers/vendors/classes — entity-linking tool, not a row catalog |
| accounting | QBO Categories | qbo-categories | REAL | accounting/index.ts:202 | catalogs.qbo_categories (0062) |
| accounting | Items | items | REAL | accounting/index.ts:129 | catalogs.items (0010) |
| accounting | Account Role Bindings | account-role-bindings | READ-ONLY-LIST | accounting/index.ts:191 (readOnly) | catalogs.account_role_bindings (0010) — "read-only v1" |
| accounting | Chart of Accounts Seeds | chart-of-accounts-seeds | REAL | accounting/index.ts:205 | catalogs.chart_of_accounts_seeds (0152) |
| accounting | Expense Categories | expense-categories | REAL | accounting/index.ts:213 | catalogs.expense_categories (0152) |
| accounting | Payment Methods | payment-methods | REAL | accounting/index.ts:221 | catalogs.payment_methods (0152) |
| accounting | Tax Codes | tax-codes | REAL | accounting/index.ts:229 | catalogs.tax_codes (0152) |
| accounting | Currency Codes | currency-codes | REAL | accounting/index.ts:237 | catalogs.currency_codes (0152) |
| names_master | Shippers | — | IN-PREP | none | none (live:false "In preparation") |
| names_master | Consignees | — | IN-PREP | none | none (live:false) |
| names_master | Brokers | brokers | REAL (derived) | FE → /api/v1/mdata/customers (filtered type="Broker") | mdata.customers — not a catalog table |
| names_master | Lenders | — | IN-PREP | none | none (live:false) |
| names_master | Insurance Carriers | — | IN-PREP | none | none (live:false) |

**Catalog tile counts (61 total):** REAL = **54** · READ-ONLY-LIST = **2** (Posting Templates, Account Role Bindings) · STUB = **1** (Journal Entry Types) · IN-PREP = **4** (Shippers, Consignees, Lenders, Insurance Carriers).

**Not exposed as tiles but confirmed real** (read-only list routes via `stub-catalog-purge.routes.ts`): `audit_event_types`, `cancellation_reasons`, `complaint_types`, `driver_leave_balances`, `labor_rates`, `leave_policies`, `maintenance_part_locations`, `parts` — these tables exist and are wired list-only.

---

## TOP SILENT-STUBS TO WIRE OR FLAG

1. **Lists Hub tile counts read a QBO mirror, not the live catalog** — `views.catalogs_inventory` `COALESCE(qbo_remote_counts…,0)` (`0055:15` / `0201:179`). Either count `catalogs.X` directly or relabel as "QBO-synced count." **HIGH.**
2. **`Vendors.tsx:391-396`** — 6 hardcoded `"—"` TMS columns (load/settlement/truck no, pickup/delivery date, loaded miles) on the LIVE vendor-bills table; toggleable, so they look like real selectable data. **HIGH** — financial panel, STOP for Jorge.
3. **`Customers.tsx:480-484`** — 5 hardcoded `"—"` TMS columns on the LIVE customer-invoice table. **HIGH** — financial panel, STOP for Jorge.
4. **`Vendors.tsx:305/307` + `Customers.tsx:389/391`** — "Shipping address" and "Custom fields" detail fields rendered as bare `—`; fields don't exist on the entity types. **MED.**
5. **`pages/profitability/*`** — fully-stubbed orphan module (KpiStrip + 4 By-X views, all hardcoded `-`, no API, not routed). Archive it; the real reports already exist under `pages/reports/`. **MED** (would be HIGH if ever routed).

Plus: **Journal Entry Types** catalog serves a hardcoded 3-row array (`factory.ts:426`) with synthetic UUIDs/timestamps — flag whether it should become a real `catalogs.journal_entry_types` table or stay a documented code-defined enum like Posting Templates.

---

## GUARD-COVERAGE GAP (flag only)

The existing prod-stub CI guard (`scripts/verify-no-prod-stubs.mjs` + `prod-stub-audit.test.ts`) only catches **phrase** stubs ("coming soon", "(stub)", "In preparation", etc.). It does **not** catch hardcoded-`—`/`"dry"`/`0` column-value stubs or the QBO-mirror count substitution — which is why all the Table-A SILENT-STUB findings survive CI green. A column-accessor-vs-row-type guard would close this.
