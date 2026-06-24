# Data-Source Correctness Map — Pass 3 (DATA-SOURCE CORRECTNESS)

**Date:** 2026-06-24
**Scope:** office frontend `apps/frontend` — every major list/table/register/detail screen mapped to what it CLAIMS to show vs the CANONICAL source table vs the ACTUAL source its live query reads.
**Method:** frontend api call → backend route/service → SQL `FROM` clause. Canonical sources per CLAUDE.md §4 + `db/migrations/`.
**Constraint:** READ-ONLY recon. No code edits, no commits, no PRs. Findings only.

**FLAG legend:** `OK` = actual == canonical, properly scoped · `WRONG-SOURCE` = reads a lookalike / different object than canonical · `GLOBAL-SHOULD-BE-PER-ENTITY` = entity-scoped concept read from a global (un-`operating_company_id`-scoped) source · `VIEW-MISSING` = reads a view that's missing/empty.

---

## HEADLINE FINDING (the one WRONG-SOURCE defect that blocks the held rewire)

**Maintenance module → "Damage Reports" tab reads the wrong object.**
`apps/frontend/src/pages/maintenance/MaintenanceHome.tsx:65` defines a tab labeled **"Damage Reports"**, and line **301** renders `<DriverReportsQueuePage />` (heading **"Driver Reports Queue"**, `DriverReportsQueuePage.tsx:132`). That page calls `listDriverReports()` → `GET /api/v1/maintenance/driver-reports` → `apps/backend/src/maintenance/driver-reports.routes.ts:56` reads **`maintenance.driver_reports`** — the **driver-PWA intake queue** (`report_type IN ('damage','maintenance','accident','other')`, status `submitted/under_review/resolved/dismissed`; created in `0161_driver_pwa_hardening.sql:43`). This is exactly the "looks-built-but-reads-the-wrong-object" defect: a tab calling itself a Damage Reports register while showing the raw driver-app intake feed.

The CANONICAL formal damage register is **`safety.incidents WHERE incident_type='damage_report'`** (created `0345_safety_incidents.sql`; explicitly documented in `202606071600_damage_insurance_continuity.sql:3` — *"damage reports = safety.incidents WHERE incident_type='damage_report'… there is no safety.damage_reports table; the canonical incidents table is used per RBC decision"*).

**NOTE — the Safety module already does this correctly.** The Safety module's Damage Reports tab (`safety/tabs` → `DamageReportsTab.tsx` → `DamageReportsPage.tsx` → `SafetyIncidentsClusterSurface.tsx:45`) calls `listSafetyIncidents(companyId,'damage_report')` → `GET /api/v1/safety/incidents` → `apps/backend/src/safety/incidents.routes.ts:74` `FROM safety.incidents WHERE operating_company_id=$1 AND incident_type=$2`, entity-scoped via `SET LOCAL app.operating_company_id` + RLS. So the rewire target and its backend endpoint **already exist and are live**; the Maintenance tab simply points at the wrong page/endpoint.

---

## SCREEN MAP

### Dispatch / Loads / Book-Load

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| DispatchBoard (live load board) | active loads + driver/HOS status | mdata.loads | `views.dispatch_load_with_driver_status` (load.routes ~:517; view in 0040) | YES (`SET app.operating_company_id`) | OK |
| Book Load wizard | load create form | mdata.loads | write-only POST `/api/v1/dispatch/loads` | YES (body) | OK |
| Assignments | quick-assign | mdata.loads | mdata.loads (quick-assign.service) | YES | OK |
| Settlements | driver settlements | driver_finance.driver_settlements | driver_finance.driver_settlements (pre-settlement.routes:75) | YES (WHERE op_co) | OK |
| Pre-Settlements | open pre-settlements | driver_finance.driver_settlements | driver_finance.driver_settlements (pre-settlement.routes:60) | YES | OK |
| Detention Board | detention events + accrual | dispatch.detention_events | dispatch.detention_events (detention.service:129) | YES | OK |
| Late Arrivals | late deliveries | mdata.loads | views.dispatch_load_with_driver_status (late-arrivals.service:51) | YES | OK |
| At-Risk Queue | at-risk in-transit | mdata.loads | views.dispatch_load_with_driver_status (arch-tabs.service:19) | YES | OK |
| In-Transit Issues | driver-reported issues | dispatch.intransit_issues | dispatch.intransit_issues (arch-tabs.service:84) | YES | OK |
| Assignment History | reassignment audit | dispatch.load_assignment_history | dispatch.load_assignment_history (arch-tabs.service:141) | YES | OK |
| POD Review | proof-of-delivery docs | dispatch.pod_documents | dispatch.pod_documents (pod.routes:207) | YES | OK |
| OCR Queue | OCR intake | dispatch.ocr_intake_items | dispatch.ocr_intake_items (ocr-processor.service) | YES | OK |
| Border Crossing History | border crossings | dispatch.border_crossing_events | dispatch.border_crossing_events (border-crossing.service) | YES | OK |
| Equipment Transfer Requests | unit/trailer transfers | mdata.equipment_transfers | mdata.equipment_transfers (equipment-transfer.service:59) | YES | OK |
| Planners (timeline/driver/truck/loads) | weekly load schedule | mdata.loads | mdata.loads (planner.service:133) | YES | OK |
| Trip Pairing Board | NB/TR/SB tours | mdata.loads | mdata.loads (trip-pairing-board.service:99) | YES | OK |

### Accounting

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| InvoicesListPage | invoices | accounting.invoices | accounting.invoices:169 | YES | OK |
| BillsPage | vendor bills | accounting.bills | accounting.bills:327 | YES | OK |
| PaymentsListPage | customer payments | accounting.payments | accounting.payments:165 | YES | OK |
| BillPaymentsListPage | bill payments | accounting.bill_payments | accounting.bill_payments:429 | YES | OK |
| ManualJEListPage | journal entries | accounting.journal_entries | accounting.journal_entries:359 | YES | OK |
| AccountRegisterPage | account register | accounting.journal_entry_postings | accounting.journal_entry_postings:121 | YES | OK |
| VendorBalancesPage | vendor balances | accounting.vendor_balances | accounting.vendor_balances:230 | YES | OK |
| FactoringListPage | factoring advances | accounting.factoring_advances | accounting.factoring_advances | YES | OK |
| FactorReconciliationPage | factor recon | accounting.factor_reconciliation_items | accounting.factor_reconciliation_items | YES | OK |
| EscrowPage | escrow accts/postings | accounting.escrow_* | accounting.escrow_accounts:146 + escrow_postings:174 | YES | OK |
| MonthClosePage | close periods | accounting.month_close_periods | accounting.month_close_periods | YES | OK |
| ExpenseCategoryMapPage | expense category maps | accounting.expense_category_map_entries | accounting.expense_category_map_entries | YES | OK |
| CoaRolesPage | COA role mappings | accounting.coa_role_account_mapping | accounting.coa_role_account_mapping | YES | OK |
| SalesTaxPage | sales tax agencies | accounting.sales_tax_agency_entries | accounting.sales_tax_agency_entries | YES | OK |
| AccountingAuditTrailPage | audit postings | accounting.journal_entry_postings | accounting.journal_entry_postings:121 | YES | OK |
| PostingLineagePage | source lineage | accounting.journal_entry_postings | accounting.journal_entry_postings:223 | YES | OK |
| RevenueRecognitionPage | rev rec schedule | accounting.revenue_recognition_schedule | accounting.revenue_recognition_schedule | YES | OK |
| FixedAssetsPage | fixed assets | accounting.fixed_assets | accounting.fixed_assets | YES | OK |
| PrepaidExpensesPage | prepaid schedule | accounting.prepaid_expense_schedule | accounting.prepaid_expense_schedule | YES | OK |
| ReceiptsPage | receipts | accounting.receipts | accounting.receipts | YES | OK |

### Banking

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| BankingHome (transactions) | bank txns + KPIs | banking.bank_transactions | banking.bank_transactions:37 | YES | OK |
| TransfersListPage | transfers | banking.transfers | banking.transfers:296 | YES | OK |
| BankReconciliationPage | recon matches | banking.bank_transactions + matches | banking.bank_transactions:37 + bank.reconciliation_matches:68 | YES | OK |
| CategorizationRulesPage | categ rules | banking.categorization_rules | banking.categorization_rules | YES | OK |
| QboSyncQueuePage | QBO sync queue | banking.qbo_sync_queue | banking.qbo_sync_queue | YES | OK |
| EmailQueuePage | email queue | banking.email_queue | banking.email_queue | YES | OK |
| BankAccountDetail | account + register | banking.bank_accounts/transactions | banking.bank_accounts + bank_transactions | YES | OK |

### Maintenance

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| **Damage Reports tab** | **formal damage register** | **safety.incidents WHERE incident_type='damage_report'** | **maintenance.driver_reports** (MaintenanceHome.tsx:65/301 → DriverReportsQueuePage → driver-reports.routes.ts:56) | YES (wrong table) | **WRONG-SOURCE** |
| Work Orders console | open WOs | maintenance.work_orders | maintenance.work_orders (work-orders.routes:346) | YES | OK |
| Defects Inbox | DVIR defects | safety.dvir_defects | safety.dvir_defects (defects.routes:82) | YES | OK |
| Vehicles master data | unit roster | mdata.units (owner/lease) | mdata.units (vehicles.routes:~175; `(owner_company_id OR currently_leased_to_company_id)`) | YES (canonical §4 scoping) | OK |
| Drivers master data | driver roster | mdata.drivers | mdata.drivers (drivers.routes) | YES | OK |
| Parts master data | parts inventory | maintenance.parts_inventory | maintenance.parts_inventory (parts.routes) | YES | OK |
| PM Schedule | PM schedules | maintenance.pm_schedules | maintenance.pm_schedules (pm-schedule.routes:88) | YES | OK |
| Inspections | inspection records | maintenance.inspections | maintenance.inspections (inspections.routes:141) | YES | OK |
| Tire Program | tire records | maintenance.tire_records | maintenance.tire_records (tires.routes:234) | YES | OK |
| Warranty Claims | warranty claims | maintenance.warranty_claims | maintenance.warranty_claims (warranty.routes:307) | YES | OK |
| Vendors | maint vendors | catalogs.maintenance_vendors | catalogs.maintenance_vendors (vendors.routes:179) | YES | OK |
| Reports | maint KPI/cost | maintenance.work_orders | maintenance.work_orders (reports.routes:50) | YES | OK |
| Fault Drafts | draft WOs from faults | maintenance.work_orders (status=draft) | maintenance.work_orders | YES | OK |

### Fleet

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| FleetHome (vehicles/trailers) | unit roster | mdata.units (owner/lease) | mdata.units (units.routes:211; `(owner_company_id=$ OR currently_leased_to_company_id=$)` at :195) | YES (canonical §4 scoping — NOT a defect) | OK |
| Vehicle Profile | unit detail | mdata.units | mdata.units (units.routes) | YES (owner/lease) | OK |
| Trailer Profile | equipment detail | mdata.units/equipment | mdata.equipment (equipment.routes) | YES (owner/lease) | OK |
| Transfers In Progress | pending transfers | mdata.equipment_transfers | mdata.equipment_transfers | YES | OK |

> **Reclassification note:** the parallel sweep initially flagged the `mdata.units`-backed Fleet/Maintenance screens as WRONG-SOURCE because they scope by `owner_company_id`/`currently_leased_to_company_id` rather than `operating_company_id`. Per CLAUDE.md §4, `mdata.units` has **no** `operating_company_id`; owner/lease scoping IS the canonical pattern (TRK owns, TRANSP leases). These are **OK**, not defects.

### Fuel

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| Fuel Planner | live optimization | views.fuel_planner_active_routes | views.fuel_planner_active_routes (planner.routes:138) | YES | OK (verify view populated) |
| Fuel History | spend/savings | fuel.fuel_transactions | fuel.fuel_transactions (planner.routes:68) | YES | OK |
| Relay Inbox | fuel-stop handoff | fuel relay table | (planner.routes) | YES | OK |
| Compliance | fuel rule compliance | views.fuel_compliance_summary | views.fuel_compliance_summary (planner.routes:87) | YES | OK (verify view) |
| Loves Prices | station pricing | fuel.loves_prices_daily | fuel.loves_prices_daily (loves-upload.routes) | YES | OK |

### Drivers / Customers / Vendors

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| DriversPage | driver roster | mdata.drivers | mdata.drivers (drivers.routes:264) | YES | OK |
| DriverDetail | driver profile | mdata.drivers | mdata.drivers (drivers.routes:1405) | YES | OK |
| ApplicantsPipelinePage | applicants | identity.driver_applicants | identity.driver_applicants (applicants.routes:87) | YES | OK |
| CustomersPage | customer list | mdata.customers | mdata.customers (customers.routes:423/445; SET op_co :398) | YES | OK |
| CustomerDetail | customer profile | mdata.customers | mdata.customers (customers.routes:623) | YES | OK |
| VendorsPage | vendor list | mdata.vendors | mdata.vendors (vendors.routes:159/184) | YES | OK |
| VendorDetail | vendor profile | mdata.vendors | mdata.vendors (vendors.routes:315) | YES | OK |

### Safety (tabs)

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| Damage Reports (safety) | damage register | safety.incidents WHERE incident_type='damage_report' | safety.incidents (incidents.routes:74) | YES | OK (correct — rewire target) |
| AccidentsIncidents | incidents | safety.incidents | safety.incidents (incidents.routes:74) | YES | OK |
| CargoClaims | cargo claims | safety.incidents WHERE incident_type='cargo_claim' | safety.incidents (CargoClaimsPage.tsx:16) | YES | OK |
| TrailerInterchanges | interchanges | safety.incidents WHERE incident_type='trailer_interchange' | safety.incidents (same cluster surface) | YES | OK |
| HOSViolations | HOS violations | hos.duty_status_events | hos.duty_status_events | YES | OK |
| EscrowRecord | escrow balances | driver_finance escrow | driver_finance (getEscrowDriverBalances) | YES | OK |
| Permits | driver permits/expiry | mdata.drivers expiry fields | mdata.drivers | YES | OK |
| DrugAlcohol | substance tests | (safety substance-test table — unverified) | NOT TRACED to FROM clause | ? | NEEDS-VERIFY |
| Insurance | policies/coverage | (insurance/accounting policy table — unverified) | NOT TRACED to FROM clause | ? | NEEDS-VERIFY |
| SafetyMeetings | meetings/training | (safety meetings/training table — unverified) | NOT TRACED to FROM clause | ? | NEEDS-VERIFY |
| External/Internal Fines | fines | (entity fine line items vs catalogs reason codes) | NOT TRACED to FROM clause | ? | NEEDS-VERIFY |

### Reports

| Screen | Claims to show | Canonical source | Actual source (file:line) | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| ARAging | AR aging | accounting.invoices + payments | accounting.invoices/payments (ar-aging.routes:60/85; SET op_co) | YES | OK |
| APAging | AP aging | accounting.bills + bill_payments | accounting.bills/bill_payments (ap-aging.routes:55/94; SET op_co) | YES | OK |
| TrialBalance / BalanceSheet / ProfitLoss | GL financials | accounting GL postings (entity-scoped) | accounting GL tables w/ SET app.operating_company_id | YES | OK (see entity-independence note) |
| CustomerProfitability | customer margin | mdata.loads + accounting.invoices | joined, SET op_co | YES | OK |
| ProfitPerTruck | per-truck margin | mdata.loads + mdata.units | joined, SET op_co | YES | OK |
| LaneProfitability | lane margin | mdata.loads | mdata.loads grouped, SET op_co | YES | OK |
| Cancellations | cancelled loads | mdata.loads status='cancelled' | mdata.loads, SET op_co | YES | OK |
| FuelReconciliation | fuel variance | mdata.loads + fuel expenses | joined, SET op_co | YES | OK |
| DispatchMargin | load margin | mdata.loads + costs | joined, SET op_co | YES | OK |
| SettlementSummary | settlement totals | driver_finance.settlement_lines | driver_finance settlements/lines, SET op_co | YES | OK |
| DeadheadReport | empty miles | mdata.loads | mdata.loads, SET op_co | YES | OK |

### Home / Dashboards

| Screen | Claims to show | Canonical source | Actual source | Entity-scoped? | FLAG |
|---|---|---|---|---|---|
| DispatcherHome KPI | active/late/today loads | mdata.loads | mdata.loads via /api/v1/dispatcher-board/home | YES | OK |
| OwnerHome KPI | revenue/expense/cash/AR/AP | accounting + banking | accounting GL + banking.bank_transactions + invoices/bills, SET op_co | YES | OK |
| DriverManagerHome KPI | drivers/escrow/debt | mdata.drivers + driver_finance | mdata.drivers + driver_finance, SET op_co | YES | OK |
| AccountingHome KPI | GL preview | accounting GL | accounting GL, SET op_co | YES | OK |
| SafetyHome KPI | open incidents/scores | safety.incidents | safety.incidents, SET op_co | YES | OK |

---

## ENTITY-INDEPENDENCE CROSS-CHECK (flag only — do NOT fix)

- **No GLOBAL-SHOULD-BE-PER-ENTITY violations were found in the live read paths above.** Every entity-scoped concept (loads, invoices, bills, payments, registers, balances, JEs, settlements, incidents, bank txns) reads a table filtered by `operating_company_id` (via `SET app.operating_company_id` + RLS or explicit `WHERE`), and `mdata.units` correctly uses owner/lease scoping.
- **Known global seed (per CLAUDE.md memory "Multi-Entity COA Path B" / "GL Ledger Map"):** `catalogs.accounts` is the entity-partitioned posting ledger and `catalogs.*` reference/catalog tables are GLOBAL by design. In the screens traced, `catalogs.accounts` appears only in JOIN context (account name/number lookup) on top of entity-scoped fact tables — no entity register was found being driven *off* a global catalog. This remains a standing architectural watch-item (Path B decommingle is its own in-flight workstream), not a new defect surfaced by this pass.
- **NEEDS-VERIFY (not flagged WRONG, just untraced):** Safety `DrugAlcohol`, `Insurance`, `SafetyMeetings`, and `External/Internal Fines` tabs were not traced all the way to a backend `FROM` clause in this pass. They should be confirmed against their canonical tables before being declared OK.

---

## DAMAGE REPORTS REWIRE — GO / NO-GO

**Verdict: GO.** The rewire is unblocked and low-risk because the target source AND its backend endpoint already exist and are live.

- **Exact target source:** `safety.incidents WHERE incident_type='damage_report'` — table created in `db/migrations/0345_safety_incidents.sql:6`, continuity columns added in `202606071600_damage_insurance_continuity.sql:14`. The migration header itself states this is the canonical damage-report store (`202606071600_…:3`).
- **Carries the preview's fields?** YES. `safety.incidents` has: `id` (report #), `unit_id` + `trailer_id` (unit), `incident_at`/`reported_at` (date), `incident_type` (type), `description`, `load_id` (linked load), `status` (`open/investigating/closed`), `photo_keys text[]` (photos, ≤10), `damage_amount_cents`, `driver_id`, `location`. A linked **work_order** id is NOT a column on `safety.incidents` today — if the preview requires a WO link, that's a small additive column (gated, since it's a schema change), not a blocker for the read rewire.
- **Backend endpoint already exists?** YES — `GET /api/v1/safety/incidents?operating_company_id=…&incident_type=damage_report` at `apps/backend/src/safety/incidents.routes.ts:64`, `FROM safety.incidents WHERE operating_company_id=$1 AND incident_type=$2` (`:74`). No new endpoint needs to be built for the list. Detail (`/:id`) and photo-upload endpoints also exist in the same file. The frontend client `listSafetyIncidents()` is in `apps/frontend/src/api/safety.ts:841`.
- **Entity-scoped?** YES — `safety.incidents.operating_company_id NOT NULL` with RLS policy `safety_incidents_tenant_scope` (`0345_safety_incidents.sql:37-50`) and the route does `SET LOCAL app.operating_company_id` (`incidents.routes.ts:54`). GRANTs to `ih35_app` present (`:52`).
- **Existing live UI already wired to it (avoid duplication)?** YES — the **Safety** module already renders this register via `SafetyIncidentsClusterSurface` (`DamageReportsTab.tsx` → `DamageReportsPage.tsx` → `SafetyIncidentsClusterSurface.tsx:45`). The cleanest rewire of the Maintenance tab is to point `MaintenanceHome.tsx:301` at the **same** `safety.incidents` damage-report surface/endpoint instead of `DriverReportsQueuePage`, rather than building anything new. (`maintenance.driver_reports` is still legitimately the driver-PWA intake queue and should keep its own surface — e.g. a "Driver Reports / Intake" tab — so nothing is deleted, only re-pointed; ADDITIVE-only per §7.)

**One open product question for Jorge before wiring:** should the Maintenance "Damage Reports" tab show the *same* `safety.incidents` register as the Safety tab (single source, two entry points), or should the Maintenance intake queue (`maintenance.driver_reports` damage-type rows) feed/triage *into* `safety.incidents`? Both are additive; the rewire itself (re-point the tab to `safety.incidents`) is GO regardless.
