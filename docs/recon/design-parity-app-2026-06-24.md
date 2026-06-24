# Design-Parity Across All Modules — Pass 1 (APP-WIDE)

**Date:** 2026-06-24
**Branch traced:** `feat/maint-damage-register-build` (carries the merged maint parity batch #1428/#1430/#1432 + the open Damage-Reports register rewire #1435).
**Scope:** every office-frontend screen that HAS an approved preview (`docs/approved-screens/*.html`) and/or a design-parity contract entry (`docs/design/design-parity-contract.json`). For each: PREVIEW vs LIVE rendered component vs whether each field has BACKING DATA (api → backend route → table/view).
**Constraint:** READ-ONLY recon. No code edits, no commits, no PRs. Findings only.

**Verdict legend:** `MATCH` = renders + data-backed to design · `DIVERGES` = a contract/preview field is missing, not-rendered, or not-persisted (each gap tagged data-backed y/n) · `WRONG-SOURCE` = reads a different object than it claims · `NOT-BUILT` = stub/empty · `NO-PREVIEW` = no approved design to compare (request design) · `SOURCE-CORRECTED` = was WRONG-SOURCE, fixed on this branch.

**Critical method note — the guard is nominal.** `scripts/verify-design-parity.mjs` is a token-PRESENCE check (lowercased, non-alphanumerics stripped) over the CONCATENATED source of a screen's mapped components. It proves a label string EXISTS somewhere in source; it does **not** prove the field renders (a token can survive in a `FormValues` type / dead file / never-true branch) and does **not** prove the field is persisted. So an ENFORCED screen can be guard-green while live-diverging. Suspects are flagged below.

---

## A. PER-SCREEN PARITY TABLE (preview/contract-backed screens)

| Screen | Module | Has preview? | Verdict | Gap fields (+ data-backed y/n each) | ENFORCED? | Notes (file:line) |
|---|---|---|---|---|---|---|
| **Load Book/Edit Wizard** | Dispatch | YES `load-wizard-render-v6.html` | **DIVERGES** | **Reefer mode** (token-only, NOT rendered — n) · **Pre-cool** (token-only, NOT rendered — n) · **Reefer setpoint** (token-only, NOT rendered — n) · Type/load_type (renders, NOT persisted on create — partial) · Cash advance (renders, not in POST — partial) · Fuel advance (renders, not in POST — partial) · Factoring company (renders, not in POST — partial) · Driver pay rate/mi (renders+drives preview, not in POST — partial) · Zip Code/postal_code (renders, not in create stops mapper — partial) · Free time/lumper (renders, not in create stops mapper — partial) | NO (guard says "at full parity") | **Guard maps a DEAD file:** `BookLoadCustomerSection.tsx` is type-only import; live modal renders §A inline (`BookLoadModalV4.tsx:834-1069`). Reefer mode/Pre-cool/Reefer setpoint were intentionally REMOVED in RENDER-A-v2 (commit `55f0ee56`; `BookLoadEquipmentSection.tsx:240-241,248-250`) but tokens linger in `BookLoadModalV4.tsx` (FormValues :80-82, defaults :234-237, POST body :520-522) → guard green over deleted fields. **The v6 contract is STALE vs the shipped RENDER-A-v2.** Reefer temp (`:279`), tarp fields (`:292-316`) are conditional-by-design (OK). HOS block always mounts (`:350`, reads `hos.duty_status_events` — #1355 false-DONE already fixed). |
| **Create/Edit Work Order Wizard** | Maintenance | YES `maintenance-create-wo-render-v5.html` | **MATCH** (per latest contract) | Deferred behind gated migrations: Priority, Close date/time (no column), Odometer/Engine-hrs Samsara (parked) — all in guard DEFERRED with reasons | YES (promoted #1434) | A→E card layout render-v5 (`CreateWorkOrderModal.tsx`); backed by full-modal DOM render-test `CreateWorkOrderModal.test.tsx` + `CreateWOSectionRenderV5Header.test.tsx`. Contract was re-aligned to the approved live UI labels (#1434). Width re-landed 672→1140px (#1433). Structurally-complex → legitimately locked because render-tests exist. |
| **Maintenance Shell** | Maintenance | YES `maintenance-FULL-with-chrome.html` | **DIVERGES** | **Eng hrs** (absent all 3 files — NOT data-backed, n; Samsara-parked) · **Last service** (absent — NOT data-backed, n; no source column) | NO (backlog) | Preview's 10-col grid is the Fleet-Table view; live "Active WOs" tab renders `WorkOrdersTable.tsx`, "Fleet" tab renders `FleetTable.tsx` — contract labels map to no single live grid. Guard's "2 MISSING" is accurate. Unit/Type/Driver/Status/Odometer/Next PM/Open WOs/Location all render + data-backed (`dashboard.routes.ts:247-255`). |
| **Fleet Table** | Maintenance/Fleet | YES `fleet-table.html` | **MATCH** | — | YES | All 12 cols render + data-backed (`FleetTable.tsx:54-70`; odometer/location via `telematics.vehicle_latest_position`, next-PM via `maintenance.pm_schedules`, open-WO via `maintenance.work_orders`). Legitimate lock. |
| **R&M Status Board** | Maintenance | YES `rm-status-board.html` | **MATCH** | — | YES (empty-token contract = nominal pass) | 5 kanban buckets + 2 stat strips (`RMBucketsGrid.tsx`, `RMStatStrip.tsx:26-34`) + 4 sidebar cards (PM Countdown/Alerts/DTC Auto WOs/Road Service Active) all render with real entity-scoped counts (`dashboard.routes.ts:35`; #1430/#1432 added 2nd strip + 5 real KPIs). Layout: right-rail rendered as stacked full-width cards, not a fixed 168px column — content present, placement differs. **Guard is nominal here (0 tokens) — relies entirely on visual.** |
| **Arriving Soon** | Maintenance | YES `arriving-soon.html` | **MATCH** | PREP intentionally deferred (issues pre-WO-conversion, `promoted_to_wo_id IS NULL`, no WO to link — `ArrivingSoonPage.tsx:154`); contract has no `prep` token | YES | All cols render + data-backed via `maintenance.v_arriving_soon` (`arriving-soon.routes.ts:89`, built on `mdata.loads`/`load_stops`/`dispatch.intransit_issues`). Open Issue/Severity added #1428. |
| **In-Transit Issues** | Maintenance | YES `in-transit-issues.html` | **MATCH** | — | NO ("at full parity", not yet promoted) | All 8 cols render + data-backed (`InTransitIssuesTable.tsx`; `dashboard.routes.ts:96-112` `FROM dispatch.intransit_issues` joined to units/drivers/loads/load_stops). **Eligible to promote to ENFORCED.** |
| **Damage Reports** | Maintenance | YES `damage-reports.html` | **SOURCE-CORRECTED** (now MATCH) | LINKED WO deferred (no work_order link col on `safety.incidents` — gated migration later, `MaintenanceDamageRegisterTab.tsx:86`; in guard DEFERRED) | YES | **WRONG-SOURCE defect RESOLVED on this branch (#1435):** now reads canonical `safety.incidents WHERE incident_type='damage_report'` (`safety/incidents.routes.ts:74`, entity-scoped+RLS), NOT `maintenance.driver_reports`. PWA intake queue moved to its own "Driver Reports" tab (`MaintenanceHome.tsx:307`, ADDITIVE). Report#/Unit/Date/Type/Description/Status/Photos all data-backed. **Until #1435 merges, main still has the WRONG-SOURCE.** |
| **Road Service** | Maintenance | YES `road-service.html` | **DIVERGES** | **ETA/RESPONSE** (NOT rendered — but column `road_service_tickets.on_scene_time` EXISTS, so data-backed=y, buildable now, not a deferral) · CALLOUT (renders but reads `created_at`, not the real `call_time` column — partial/wrong-field) | NO (backlog, guard 1-MISSING) | `RoadServiceList.tsx`; table `maintenance.road_service_tickets` (`0395-road-service-tickets.sql:13-14`). WO#/Unit/Driver/Location/Provider/Status/Cost render+backed. **ETA/RESPONSE is the most-actionable gap: data exists, just not wired.** |
| **Service / Location** | Maintenance | YES `service-location.html` | **MATCH** | — | YES | 3 cols render + data-backed (`ServiceLocationPage.tsx`; `dashboard.routes.ts:335-359` group `FROM maintenance.work_orders` by service_location/bucket). Legitimate lock. |
| **Severe Repairs** | Maintenance | YES `severe-repairs.html` | **MATCH** | — | YES | All 9 cols render + data-backed (`SevereRepairOosTab.tsx`; `severe-repair-estimate.service.ts:50` `FROM maintenance.severe_repair_estimates` joined units/drivers; DOWN SINCE=`units.oos_since`, EST.RETURN=`estimated_completion_date`). Legitimate lock. |
| **Accounts Payable** | Accounting | YES `accounts-payable-render.html` | **DIVERGES** (minor; lock legit for what it asserts) | **Aging bucket-filter dropdown** (preview-only, NOT BUILT — n live; data-backed=y if built, buckets already computed) · **Basis** (renders as static "Accrual" label, not a Cash/Accrual selector — cash data-backed=n; **intentional/locked** per `verify-basis-selector-allowed-pages.mjs`) | YES | 10/12 contract labels render real + data-backed (`AccountsPayableAgingPage.tsx`; `ap-aging.service.ts:99` `FROM accounting.bills LEFT JOIN mdata.vendors`, entity-scoped `:71`). **Vendor-type filter is REAL** (`mdata.vendors.vendor_type` exists since `0008_mdata_init.sql:130`; mapped to server-computed `display_group` `ap-aging.service.ts:50-63`) — the "AP vendor_type Tier-2 migration" memo is NOT needed for this screen. The `aging` token passes the guard INCIDENTALLY (import/comment/subtitle), masking the missing filter — exactly the documented token false-positive. |

---

## B. HAS-PREVIEW but NOT in the contract (reference previews — NOT guard-enforced)

These have an approved HTML preview but no `design-parity-contract.json` entry, so the guard never checks them. They are QBO-parity / trip-tour reference designs. Live sources are correct per `docs/recon/data-source-map-2026-06-24.md`.

| Screen | Module | Preview | Live component | Source verdict (data-source-map) | Notes |
|---|---|---|---|---|---|
| Chart of Accounts (QBO parity) | Accounting/Lists | `preview-coa-qbo.html` | `ChartOfAccountsListPage.tsx` / `ChartOfAccounts.tsx` | OK (`catalogs.accounts`, entity-partitioned) | Not in contract → not enforced. No field-level parity guard. **Candidate to add a contract entry** if COA parity matters. |
| Account Register (QBO parity) | Accounting | `preview-register-qbo.html` | `AccountRegisterPage.tsx` | OK (`accounting.journal_entry_postings:121`) | Not in contract → not enforced. Candidate for a contract entry. |
| Trip Pairing Board v4 | Dispatch | `trip-pairing-board-v4.html` | `TripPairingBoardPage.tsx` | OK (`mdata.loads`, trip-pairing-board.service:99) | Not in contract. Has a separate wizard-section-contract.json? No — `docs/design/wizard-section-contract.json` is the Book-Load section contract. Trip board is unguarded. |
| Load wizard (with trip-type) | Dispatch | `load-wizard-with-trip-type.html` | (variant of Book-Load modal) | OK (mdata.loads; trip_type column exists per §4) | Superseded variant of `load-wizard-render-v6.html`; the v6 file is the contract design_file. Possibly the newer intent — see DRIFT note below. |

---

## C. NO-PREVIEW (cannot compare — request design before parity-locking)

These are live, data-source-verified (`docs/recon/data-source-map-2026-06-24.md` = all OK), but have only a **module-level PNG** (`docs/approved-screens/N-*.png`) or no field-level approved design — so no field/column parity check is possible. Listed by module:

- **Dispatch (PNG `8-Dispatch-Home.png` only):** DispatchBoard, Assignments, Settlements, Pre-Settlements, Detention Board, Late Arrivals, At-Risk Queue, In-Transit Issues (dispatch), Assignment History, POD Review, OCR Queue, Border Crossing History, Equipment Transfer Requests, Planners, Trip Pairing Board.
- **Accounting (PNG `3-Accounting-Dropdown.png` only):** Invoices, Bills, Payments, Bill Payments, Manual JE, Vendor Balances, Factoring, Factor Reconciliation, Escrow, Month Close, Expense Category Map, COA Roles, Sales Tax, Audit Trail, Posting Lineage, Revenue Recognition, Fixed Assets, Prepaid Expenses, Receipts.
- **Banking (PNG `4-Banking_Homepage.png` + QBO ref PNGs):** BankingHome, Transfers, Bank Reconciliation, Categorization Rules, QBO Sync Queue, Email Queue, Bank Account Detail. (QBO `qbo-banking-*.png` refs exist but are not field-contracts.)
- **Fuel (PNG `5-Fuel_Planner.png`):** Fuel Planner, Fuel History, Relay Inbox, Compliance, Loves Prices.
- **Safety (PNG `6-Safety.png`):** all 21 tabs. NOTE: `DrugAlcohol`, `Insurance`, `SafetyMeetings`, `External/Internal Fines` are NEEDS-VERIFY (untraced FROM clause) per data-source-map §ENTITY-INDEPENDENCE.
- **Drivers / Customers / Vendors (PNGs `7-Drivers.png`):** DriversPage, DriverDetail, ApplicantsPipeline, CustomersPage, CustomerDetail, VendorsPage, VendorDetail.
- **Reports (PNG `10-Reports.png`):** AR Aging, AP Aging (report variant), Trial Balance, Balance Sheet, P&L, Customer Profitability, Profit per Truck, Lane Profitability, Cancellations, Fuel Reconciliation, Dispatch Margin, Settlement Summary, Deadhead.
- **Home (PNG `1-HOME_PAGE.png`):** DispatcherHome, OwnerHome, DriverManagerHome, AccountingHome, SafetyHome.
- **Form 425C (PNG `11-Form_425-Design.png`), Lists (PNG `9-Lists_and_catalogs.png`).**

→ **For all of the above, a field-level parity audit is BLOCKED on having an approved field-level preview.** Module-level PNGs prove chrome/nav (enforced separately by `verify:arch-design` + `docs/locked-ui-surface.json`), not column/field parity.

---

## D. ENFORCED-SET CROSS-CHECK (guard green ≠ live-correct)

ENFORCED set (`verify-design-parity.mjs:121-133`): **Fleet Table, Damage Reports, Service/Location, R&M Status Board, Accounts Payable, Arriving Soon, Severe Repairs, Create/Edit Work Order Wizard.** Guard run on this branch: **PASS 8/8.**

| ENFORCED screen | Lock legitimate? | Reason |
|---|---|---|
| Fleet Table | ✅ legit | All cols render + data-backed. |
| Severe Repairs | ✅ legit | All cols render + data-backed. |
| Service/Location | ✅ legit | All cols render + data-backed. |
| Arriving Soon | ✅ legit | All cols render + data-backed; PREP deferred (no token). |
| Create/Edit WO Wizard | ✅ legit | Multi-section wizard backed by required DOM render-tests (the structural backstop). |
| Damage Reports | ✅ legit ON THIS BRANCH | Reads correct `safety.incidents` after #1435. **SUSPECT on `main`** until #1435 merges (main still points at `maintenance.driver_reports` = WRONG-SOURCE). |
| **R&M Status Board** | ⚠️ NOMINAL | Contract has **empty token list** (`required_tokens: []`) → the guard asserts NOTHING for this screen; it is "enforced" in name only. Live looks correct (verified manually above) but the guard would stay green even if the board were gutted. **Add tokens or a render-test.** |
| **Accounts Payable** | ⚠️ SUSPECT (partial) | Real screen, correct source — but the **Aging bucket-filter dropdown is NOT BUILT** while the `aging` token passes incidentally (import/comment/subtitle). Guard is green over a missing preview control. Also Basis is a static label, not the preview's Cash/Accrual selector (intentional/locked). Add a render-test asserting the Aging filter mounts, or accept the documented divergence. |

---

## E. PRIORITY DIVERGENCES TO FIX (ranked by user-visibility)

1. **Load Book/Edit Wizard — reconcile v6 contract to shipped RENDER-A-v2 (HIGH, most-used screen).** Reefer mode / Pre-cool / Reefer setpoint were deliberately removed from the live equipment panel but the contract + guard still "require" them (passing only via dead tokens in `BookLoadModalV4.tsx`). Re-cut `load-wizard-render-v6.html`/contract to the single-setpoint RENDER-A-v2 reality, drop the dead `BookLoadCustomerSection.tsx` from `SCREEN_COMPONENTS`, THEN promote. *Data-backed:* the 3 dropped fields are gone by design (no fix needed beyond contract); the 7 rendered-but-unpersisted-on-create fields (Type, Cash/Fuel advance, Factoring, pay-rate, Zip, free-time-lumper) need either create-payload wiring or a documented DEFERRED reason. *Mostly NOT data-backed on create.*

2. **Damage Reports — land #1435 to main (HIGH, fixes a live WRONG-SOURCE).** Until merged, the Maintenance Damage Reports tab on production still shows the raw `maintenance.driver_reports` PWA intake instead of the formal `safety.incidents` register. *Target data-backed: YES* (`safety.incidents` + endpoint already live). This is the single highest-confidence correctness fix.

3. **Road Service — wire ETA/RESPONSE (MEDIUM, data already exists).** `road_service_tickets.on_scene_time` is a real column (`0395-road-service-tickets.sql:14`) but unrendered; CALLOUT also mis-reads `created_at` instead of `call_time` (`:13`). Buildable immediately — *data-backed: YES*, no migration needed. Unlike PREP / Linked-WO this is not a legitimate deferral.

4. **Accounts Payable — build the Aging bucket-filter dropdown (MEDIUM).** Preview has an All/Current/1–30/…/91+ filter; live has only aging columns. *Data-backed: YES* (buckets already computed client-side; trivial filter). Add a render-test so the ENFORCED lock actually covers it.

5. **R&M Status Board — give the guard teeth (MEDIUM, integrity).** It is ENFORCED with an empty token list, so the guard protects nothing. Populate `required_tokens` from `rm-status-board.html` (bucket names, stat-strip labels, sidebar card titles) or add a DOM render-test. *Data-backed: YES* (all counts render from real entity-scoped queries) — the risk is silent future regression, not current breakage.

**Maintenance Shell (Eng hrs / Last service)** is a known, legitimately-deferred gap (no DB column; Samsara parked) — lower priority, not a defect.

---

## F. DRIFT FLAGGED (per CLAUDE.md §9 — naming both files, not silently picking)

- **`load-wizard-render-v6.html` (contract design_file) vs `load-wizard-with-trip-type.html` vs the SHIPPED RENDER-A-v2 panel** (commit `55f0ee56` / `BookLoadEquipmentSection.tsx`). Three states of the Book-Load reefer/trip design disagree: the contract still lists Reefer mode + Pre-cool + Reefer setpoint as 3 separate fields; the live code collapsed them to a single temperature=setpoint. **Which is canonical — re-cut the contract to RENDER-A-v2, or restore the 3 fields?** Ask Jorge before promoting Load Book/Edit Wizard to ENFORCED.
- **`maintenance-FULL-with-chrome.html` Shell grid vs live tab split.** The preview shows one 10-col grid; live splits Fleet vs Active-WOs into two grids with different columns. Eng hrs / Last service exist in the preview grid but in neither live grid (and have no DB column). Confirm the preview is still the intended single-grid Shell, or update it to the shipped two-tab layout.
