# IH35-TMS — COMPREHENSIVE ARCHITECTURAL DESIGN

**The canonical reference. Every module, every tab, every action.**

> This document is the single source of truth for what every screen contains and what every button does. It synthesizes:
> - The formal v3 Master Blueprint (`IH35_MASTER_BLUEPRINT_v3_FULL.md`)
> - The Unified Blueprint Additions (chat-derived ideas locked at `b562c14`)
> - All 12 approved screen PNGs in `docs/approved-screens/`
> - Every Jorge-stated design intent from chat history
>
> If a feature is in this document, it MUST be in the system. If it's not in this document, it doesn't ship.

**Last updated:** Wed May 6, 2026 evening · Jorge + Claude
**Status:** LOCKED — to be added to repo as `docs/specs/IH35_ARCHITECTURAL_DESIGN.md`

---

## TABLE OF CONTENTS

- [Global Layout](#global-layout)
- [Module 1 — HOME / Owner Dashboard](#module-1--home--owner-dashboard)
- [Module 2 — MAINTENANCE](#module-2--maintenance)
- [Module 3 — ACCOUNTING](#module-3--accounting)
- [Module 4 — BANKING](#module-4--banking)
- [Module 5 — FUEL PLANNER](#module-5--fuel-planner)
- [Module 6 — SAFETY](#module-6--safety)
- [Module 7 — DRIVERS](#module-7--drivers)
- [Module 8 — CUSTOMERS](#module-8--customers)
- [Module 9 — DISPATCH](#module-9--dispatch)
- [Module 10 — VENDORS](#module-10--vendors)
- [Module 11 — DOCUMENTS](#module-11--documents)
- [Module 12 — LISTS / CATALOGS](#module-12--lists--catalogs)
- [Module 13 — REPORTS](#module-13--reports)
- [Module 14 — 425C (Ch.11 DIP UST Report)](#module-14--425c-ch11-dip-ust-report)
- [Module 15 — DRIVER PWA](#module-15--driver-pwa)
- [Cross-cutting concerns](#cross-cutting-concerns)
- [Phase mapping — what ships when](#phase-mapping--what-ships-when)

---

## GLOBAL LAYOUT

Every page renders inside a 3-zone shell:

| Zone | Contents | Always Visible |
|------|----------|----------------|
| **Top bar** | "IH 35 DISPATCH" wordmark · Integration status pills (QuickBooks · Samsara · Relay) · Operating Company switcher (IH 35 Trucking LLC / IH 35 Transportation LLC / USMCA Freight Solutions) · Live date+time CT · User dropdown (login email · settings · logout) | Yes |
| **Left sidebar** | 19 module icons + labels (locked order in `apps/frontend/src/components/layout/sidebar-config.ts`): HOME · MAINT · DISPATCH · SAFETY · ACCTG · BANK · FACT · PAY · CUSTOMERS · VENDORS · LISTS · REPORTS · LEGAL · DOCS · ELD · 425C · DRV APP · USERS · HELP — FUEL and DRIVERS live under BANK / DISPATCH flyouts, not top-level | Yes (collapsed icons on narrow viewport) |
| **Main work area** | Module-specific header (page title + subtitle + primary action button) → sub-nav tabs → KPI row → main content (table / kanban / drawer / cards) | Yes |

**Operating company switcher** — every module respects RLS scoped to selected operating company. Default = IH 35 Transportation LLC (the active Ch.11 DIP carrier).

**Action button rule (LOCKED)** — primary buttons say "+ Create" or "+ Book" (NEVER "+ New", NEVER "+ Add").

---

## MODULE 1 — HOME / Owner Dashboard

**Route:** `/home`
**Approved screen:** `1-HOME_PAGE.png`
**Phase 3 task:** P3-T11.16
**Purpose:** Owner's daily attention list — the one screen that shows what needs eyes today

### Top action button
**+ Set Quick Filter** (saves Owner's most-used cross-cutting view)

### Sub-nav tabs (4)

| Tab | What it shows | Primary action |
|-----|---------------|----------------|
| **Today** | KPI row + 6 attention cards | Click any card to drill in |
| **This Week** | 7-day rolling metrics + open-items list | Filter by company |
| **Open Items** | Everything currently needing Owner action across all modules | Bulk approve / dismiss |
| **Compliance** | Ch.11 DIP open obligations (425C status, escrow balance, factoring single-link) | Drill to source |

### KPI row (Today tab) — 6 cards

| Card | Shows | Click goes to |
|------|-------|---------------|
| Cash Position (today) | Sum of all real bank account balances | /banking |
| Open Loads | Count by status (assigned / in-transit / delivered-pending-doc) | /dispatch |
| Pending Approvals | Count of items awaiting Owner sign-off | /home (filtered) |
| Driver Debt Total | Sum of all driver_liabilities outstanding | /liabilities |
| Active Integrity Alerts | Phase 6 alert engine output (theft/collusion patterns flagged) | /safety/integrity-alerts |
| 425C Status | Days until next UST submission | /425c |

### 6 attention cards (Today tab)

1. **Loads needing border-routing decision** — yellow, count + jump to filtered Dispatch
2. **Drivers with high debt** — top 5 + recompute_driver_debt links
3. **Maintenance arriving soon needs service** — units arriving with open in-transit issues
4. **Dispatch blocked units** — `is_dispatch_blocked = true` count + jump
5. **Open accident reports** — Safety triage queue link
6. **Bank reconciliation deltas** — unmatched transactions count

---

## MODULE 2 — MAINTENANCE

**Route:** `/maintenance`
**Approved screen:** `2-Maintenance.png`
**Phase 3 tasks:** T11.6 (shipped) · T11.6.1 (WO format + vendor + inventory + integrity views — pending merge) · T11.6.2 (Arriving Soon queue — pending) · T7 (Samsara DTC integration — Phase 4 carryover)
**Purpose:** Work order lifecycle + vendor reconciliation + parts tracking + units-needing-service queue

### Top action button
**+ Create Work Order** (opens CreateWOModal with source type selector)

### Sub-nav tabs (10 total — UPDATED with locked design)

| Tab | What it shows | Notes |
|-----|---------------|-------|
| **Active WOs** | All open + in-progress WOs in table view | Default view |
| **Fleet Table** | Fleet-oriented maintenance table by unit | Phase 3 shell; bulk-select checkbox column (Block A5) with sticky BulkActionBar for Change Status (Active · Sold · Transferred · Damaged · OOS) and Change Type; POST `/api/v1/mdata/units/bulk-update` is RLS-scoped and emits one `unit.bulk_update` audit row per affected unit; Block B4 joins trucks (`mdata.units`) and trailers (`mdata.equipment`) in one list via GET `/api/v1/mdata/units?include=trailers` with `kind` discriminator, Type column, and trailer bulk-update at POST `/api/v1/mdata/equipment/bulk-update`; Block B5 adds type filter dropdown (All · Truck · Tractor · Reefer · DryVan · Flatbed · Stepdeck · Lowboy · Tanker · Custom) with URL sync `?type=` on GET `/api/v1/mdata/units?include=trailers&type=` combined AND with `status=` |
| **R&M Status Board** | Kanban: Open / Awaiting Parts / In Progress / Awaiting Vendor / Completed | Drag-to-transition |
| **Service / Location** | Service location board and queue split by location | Phase 3 shell |
| **Arriving Soon Needs Service** ← NEW T11.6.2 | Cards of units arriving at yard with open in-transit issues + ETA | Phase 3 ships UI; Phase 4 wires live Samsara ETA |
| **In-Transit Issues** | Triage queue from `dispatch.intransit_issues` (driver-reported failures) | "Promote to WO" action per WF-049 |
| **Damage Reports** | Pre-WO damage photo intake | Auto-spawn WO-AC if accident |
| **Severe Repairs** | High-severity repair alerts and escalations | Phase 3 shell |
| **Parts Inventory** ← NEW T11.6.1 | Light stock tracking (anti-theft daily-purchase pattern) | "+ Record Purchase" button |
| **Settings** | PM intervals per equipment class · Vendor preferences · Bay assignments | Owner+Admin only |

### KPI row (Active WOs tab) — 6 cards

Open WOs · WOs in Vendor · Avg WO Cost (90d) · Tire WOs (60d) · Accident WOs (12mo) · Total Maintenance Cost (90d)

### Active WOs table columns

Display ID (`WO-T169-IS-05-06-2026-0035-23914`) · Source Type (pill: IS/ES/AC/ET/RT/IT/RS) · Unit · Driver (when accident or in-transit origin) · Vendor (when external) · Status · Total Cost · Created · Action

### Create WO Modal (LOCKED design)

**Step 1 — Source Type (REQUIRED)**
Dropdown with 7 options:
- IS — Internal Shop (IH35 own shop, non-tire)
- ES — External Shop (outside vendor)
- AC — Accident (linked to safety accident report)
- ET — External Tires (Loves, TA, Pilot, etc.)
- RT — Roadside Tires (vendor came to truck)
- IT — Internal Tires (IH35 own shop, tire-specific)
- RS — Roadside Service (non-tire roadside: tow, jump, breakdown)

**Step 2 — Unit + Date** (always required)

**Step 3 — Conditional fields based on source type:**

For ES/AC/ET/RT/RS (external):
- External Vendor (vendor picker — `master_data.vendors`)
- External Vendor WO Number
- External Vendor Invoice Number
- External Vendor Invoice Amount
- External Vendor Invoice PDF Upload (R2, optional at create, recommended at completion)

For IS/IT (internal):
- "Labor Only (no parts)" checkbox
- Parts Used section with "+ Add Part" button
- Each part: Vendor + Invoice # + Invoice Amount + Qty + Description + (optional) link to existing parts_inventory row

**Step 4 — Cost section** (parts subtotal + labor subtotal + total)
- For ES/AC/ET/RT/RS: must equal external_vendor_invoice_amount within $0.01
- For IS/IT with parts: parts subtotal must equal sum of parts_links amounts × qty
- Real-time validation banner shows mismatch

**Step 5 — Display ID preview**
"Will be: WO-T169-IS-05-06-2026-NNNN-PEND0 (V5 updates when vendor reference entered)"

### WO Detail Drawer (right slide-in)

- Display ID with V5 suffix (locked at completion)
- Source type pill
- Status timeline
- Cost breakdown
- For external WOs: vendor invoice details + R2 PDF link
- For internal WOs: parts links table
- "Refresh Display ID" button (admin-only) — recomputes V5 from current state
- "Mark Completed" — blocked with tooltip if validations fail
- Audit history sidebar (every change tracked)

### Cross-module integrations (LOCKED)

- **Safety AccidentReportDrawer "Spawn WO"** → auto-creates WO with source_type='AC' + pre-fills vendor from accident if known
- **Dispatch In-Transit Issue "Promote to WO"** → creates WO linked to original issue per WF-049
- **WO completion** → posts Bill in Accounting (vendor = repair shop) → creates JE
- **PM-due read API** → consumed by Dispatch WF-044 (advisory warning on unit assignment)
- **DVIR major defect** → sets unit `is_dispatch_blocked = true` per WF-050

---

## MODULE 3 — ACCOUNTING

**Route:** `/accounting`
**Approved screen:** `3-Accounting-Dropdown.png`
**Phase 3 status:** Hub UI shows Phase 5 placeholders ("After accounting cutover")
**Phase 5 tasks:** P5-T1 through P5-T11
**Purpose:** Replace QBO entirely — full chart of accounts + bills + invoices + JE + posting service

### Top action button
**+ Create Manual JE** (Owner-only above threshold)

### Sub-nav tabs (12 — Phase 5 expanded)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Dashboard** | P&L summary + cash flow + AR aging + AP aging | Phase 5 |
| **Chart of Accounts** | Full COA hierarchy + edit | Phase 5 |
| **Bills (AP)** | Vendor bills with payment status | Phase 5 (currently QBO) |
| **Invoices (AR)** | Customer invoices with factoring status | Phase 5 |
| **Journal Entries** | All JE with manual JE attestation | Phase 5 |
| **Posting Templates** | WF-053 cross-module posting service config | Phase 5 |
| **Allocations** | Multi-unit cost allocation (Section 3.14) | Phase 5 |
| **Customer Credits / Chargebacks** | Memo + chargeback workflow (P5-T6) | Phase 5 |
| **QBO Sync Status** | Live sync log + drift detection during parallel run | Phase 5 |
| **Period Close** | Month-end close checklist + Owner sign-off | Phase 5 |
| **Audit Trail** | Append-only event log | Phase 5 |
| **Settings** | Posting rules · Class config · Default accounts | Owner only |

### KPI row — 6 cards
Net Income (MTD) · Gross Margin % · AR Total · AP Total · Cash on Hand · Net Cash Flow (30d)

### Phase 3 placeholder messaging
Sub-nav routes show: "Available after accounting cutover (Phase 5)" — wired in T11.14 Catalog UI placeholder block

---

## MODULE 4 — BANKING

**Route:** `/banking`
**Approved screen:** `4-Banking_Homepage.png`
**Phase 3 task:** T11.9 (shipped at `85b5779`) · T11.12 Factoring detail (pending)
**Phase 5 tasks:** P5-T1, P5-T2, P5-T3, P5-T9 (live integrations)
**Purpose:** All bank account activity + factoring + escrow + reconciliation

### Top action button
**+ Manual JE** (for adjustments not routed through normal flows)

### Sub-nav tabs (12 — locked design)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Home** | Account tiles (real banks + virtual factoring/escrow) | Phase 3 ✅ shipped |
| **All Transactions** | Unified ledger across all accounts | Phase 3 ✅ |
| **BOA Checking** | Bank of America operating account | Phase 3 ✅ |
| **IBC Checking** | IBC operating account | Phase 3 ✅ |
| **Factoring (Faro)** | Entry tab inside Banking that shows thin summary + **navigates to standalone `/factoring`** deep-dive page. `/factoring` sub-tabs: **Recourse Pipeline**, **Chargebacks & Fees**, **Statements & Settings** | T11.12 pending |
| **Escrow (virtual)** | Per-driver escrow balances | Phase 3 ✅ |
| **Categorize Drawer** | Uncategorized transactions queue (8 actions) | Phase 3 ✅ |
| **Reconciliation Workspace** | Match bank txns to GL entries · sign-off | Phase 6 (P6) |
| **Bank Statement Import** | PDF parser for non-feed banks | Phase 6 |
| **Plaid Connections** | Live bank feed config | Phase 6 |
| **Relay Card** | Fuel card transactions auto-categorized | Phase 4 (live API) |
| **Settings** | Account map · Posting rules · Sweep config | Owner only |

### KPI row — 6 cards
BOA Balance · IBC Balance · Factoring Available · Escrow Total · MTD Inflow · MTD Outflow

### Categorize Drawer — 8 actions per uncategorized transaction
1. Match to load (creates invoice receipt)
2. Match to bill (creates bill payment)
3. Match to fuel card transaction
4. Match to driver advance disbursement
5. Match to driver settlement payout
6. Mark as fee/charge (creates bill)
7. Manual JE (Owner only)
8. Defer for later

### Critical invariants enforced
- **Single-link constraint** (WF-012) — one bank txn → one entity link only
- **Single-factor invariant** (WF-017) — only one active factor per company
- **Cache-NEVER-used** for driver debt in render (Part 4.5.4.2)

---

## MODULE 5 — FUEL PLANNER

**Route:** `/fuel`
**Approved screen:** `5-Fuel_Planner.png`
**Phase 3 task:** T11.8 (shipped at `d8bf599`)
**Phase 4 tasks:** P4-T1 (Samsara live), P4-T7 (HOS live)
**Purpose:** HOS-aware route planning with fuel stop optimization + Loves data import + IFTA

### Top action button
**+ Plan Fuel Route**

### Sub-nav tabs (8 — locked design)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Active Plan** | Current route fuel plan with stop optimization | Phase 3 ✅ |
| **Fuel Log** | Fuel transaction stream and review | Phase 3 shell |
| **Loves Prices** | Excel upload from Loves portal · auto-categorize transactions | Phase 3 ✅ |
| **Relay Transactions** | Relay transaction feed for reconciliation | Phase 3 shell |
| **DEF** | DEF purchases and usage review | Phase 3 shell |
| **Compliance Tracker** | Drivers with fuel/HOS compliance issues | Phase 3 ✅ |
| **Fuel by Unit/Driver/State (IFTA)** | Per-state miles + gallons + tax | Phase 3 ✅ |
| **Settings** | Preferred fuel networks · Avoid states · HOS thresholds | Owner only |

### KPI row — 5 cards
MPG Fleet Avg · MTD Gallons · MTD Fuel Cost · IFTA Tax (Q-to-date) · Savings vs Plan (90d)

### Cross-module
- Drivers in Drivers module link to fuel transactions here
- Maintenance Integrity Report uses MPG anomaly detection from this module

---

## MODULE 6 — SAFETY (V6.4 UI)

**Route:** `/safety/*`  
**Phase 3 task:** `P3-T11.17.3`  
**Purpose:** Compliance, inspections, discipline, liabilities, integrity monitoring in a single shell.

### Layout invariants (Jorge G3, G4, G25)
- Top horizontal navigation only. No secondary sidebar is allowed.
- The global 80px navy module sidebar remains unchanged and is outside the safety layout.
- Safety sub-navigation uses hover-dropdown group buttons that open downward.
- Active group uses navy text with navy bottom-border underline.
- Active tab in dropdown uses navy left-border accent, bold text, and light gray background.
- Active tab name is displayed on the far right of the group navigation strip.
- Header includes back-arrow, breadcrumb `Modules > Safety > {group}`, page title `Safety`, and descriptor text.
- Driver filter strip defaults to **Active 7-10 days** and is visible on all safety routes.

### Grouped top navigation (24 tabs across 9 groups)

### Sub-nav tabs (24 — V6.4 top hover-dropdown + Block K workforce)

| Group | Tabs |
|---|---|
| Driver Files & Training | Driver Files, Drug & Alcohol, Safety Meetings |
| Hours & Fatigue | Hours of Service, HOS Violations |
| Inspections & FMCSA | Vehicle Inspections-IDVR, DOT Inspections, CSA Score, DOT Compliance |
| Incidents & Claims | Accidents & Incidents, Damage Reports, Trailer Interchanges, Cargo Claims |
| Fines & Discipline | Internal Fines, External Fines, Complaints |
| Driver Financial Safety | Escrow Record |
| Compliance Docs & Monitoring | Insurance, Permits, Integrity Reports |
| Workforce Planning (Block K) | Driver Scheduler, Leave Requests, Leave Balances |
| Settings | Settings |

### V6.4 tab behaviors shipped in Phase 3
- HOS Violations: list/create/void flow with driver/date/source filtering and action column.
- DOT Inspections: list/create/void flow, OOS confirmation prompt for auto-spawned WO, PDF upload endpoint wiring.
- CSA Score: current score + BASIC categories, Hazmat always rendered as `-`, manual recompute button, SAFER pull 501 stub.
- Complaints: privacy-gated workflow with `403 E_COMPLAINT_PRIVACY_GATED` restricted screen for unauthorized roles.
- Escrow Record: escrow summary table with owner-only forfeit action and legacy-driver clause block path in UI.
- Integrity Reports: four sub-tabs (WO Cost, Fuel MPG, Driver Dwell, HOS Pattern) with per-row Review action.

### Route compatibility
- `/safety` redirects to `/safety/driver-files`.
- Legacy bookmark route `/safety/vehicle-inspections` redirects to `/safety/idvr`.

---

## MODULE 7 — DRIVERS

**Route:** `/drivers`
**Approved screen:** `7-Drivers.png` + `7-Drivers-Reson.png`
**Phase 1 task:** P1-T11 (shipped) · Driver Settlement T11.7 (`44e5c20`) · Liabilities T11.10 (`d24d926`) · Cash Advance T11.11 (`24747af`)
**Purpose:** Driver master data + settlements + liabilities + cash advances + onboarding/offboarding

### Top action button
**+ Create Driver**

### Sub-nav tabs (10 — locked design)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **All Drivers** | Active driver list + filters | Phase 1 ✅ |
| **Driver Detail** (per row) | Full profile + safety file + settlements + liabilities + advances | Phase 1 ✅ |
| **Active** | Currently dispatched | Phase 1 ✅ |
| **Inactive** | Off-duty / leave / pending | Phase 1 ✅ |
| **Rehires** | Reapplications with state machine | Phase 1 ✅ |
| **Settlements** | All settlements + debt-alert + escrow visualizer | Phase 3 ✅ T11.7 |
| **Liabilities** | All driver_liabilities + ack status + forfeiture | Phase 3 ✅ T11.10 |
| **Cash Advances** | All cash advances + WF-057 bill linkage | Phase 3 ✅ T11.11 |
| **Pay Plans** | Per-driver pay code overrides | Phase 3 (T11.14 catalog) |
| **Settings** | Default escrow % · Settlement period · Ack channels | Owner only |

### KPI row — 6 cards
Active Drivers · Drivers w/ Debt · MTD Settlements Run · Pending Acks · Avg Net Pay (last settlement) · Drivers w/ Active Advance

### Driver Detail page (deep tabs within driver record)
- Profile (DOT info · CDL · medical · contact)
- Safety File (drug tests · MVR · PSP · annual review)
- Settlements (history + dispute workflow)
- Liabilities (active + paid)
- Advances (active + paid)
- Documents (W-9 · I-9 · contract · acknowledgments)
- Audit Trail
- Communication Log (WhatsApp/SMS/Email history)

---

## MODULE 8 — CUSTOMERS

**Route:** `/customers`
**Approved screen:** (no PNG — built per blueprint Section 1.4)
**Phase 1 task:** P1-T12 + P1-T19 series (shipped)
**Purpose:** Broker/shipper master data + factoring config + credit + flags

### Top action button
**+ Create Customer**

### Sub-nav tabs (8)

| Tab | What it shows |
|-----|---------------|
| **All Customers** | Searchable table with credit + factoring + flags |
| **Customer Detail** | Full profile · contracts · loads · disputes · invoices |
| **By Quality Flag** | Pre-flag triage (P1-T19.5) |
| **Pending FMCSA Auth Verification** | P2-T4 carryover queue |
| **Disputes** | Open chargebacks/credit memos |
| **Factoring Config** | Per-customer factoring routing (Faro vs CCG) |
| **Scoring** | Phase 6 customer score (P6-T1) |
| **Settings** | Default credit terms · Approval thresholds |

### KPI row — 5 cards
Active Customers · Open Loads · MTD Revenue · AR Total · Disputes Open

### Customer detail read APIs (Block A8)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/mdata/customers/:id/detail` | Full profile + contacts JSON; TRANSP-scoped; audits `mdata.customers.detail_viewed` |
| `GET /api/v1/mdata/customers/:customer_id/billing-summary` | AR aging buckets + factoring/layover config; audits `mdata.customers.billing_summary_viewed` |
| `GET /api/v1/customers/:id/detail` | 307 alias to mdata detail (validated UUID + `operating_company_id`) |
| `GET /api/v1/customers/:customer_id/billing-summary` | 307 alias to mdata billing summary |

---

## MODULE 9 — DISPATCH

**Route:** `/dispatch`
**Approved screen:** `8-Dispatch-Home.png`
**Phase 3 task:** T11.5 (`e013abe`) + T11.5.1 Auth Gates (`5604c31`)
**Pending:** T4 (assignment history), T5.5 (planner calendar), T9+T10 (OCR + email)
**Purpose:** Load lifecycle from booking through delivery + invoice handoff

### Top action button
**+ Book Load**

### Sub-nav tabs (10 — locked design)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Board (Kanban)** | Pending Assignment / Assigned / In Transit / Delivered / Completed | Phase 3 ✅ |
| **Board (List)** | Same data, table format with sortable columns | Phase 3 ✅ |
| **Planner (Calendar)** | Week-at-a-glance per dispatcher (T5.5 pending) | Phase 3 — T5.5 |
| **In-Transit Issues** | Driver-reported issues queue (WF-005, WF-048) | Phase 3 ✅ |
| **Border Routing Decisions** | Loads needing routing decision (yellow band) | Phase 3 ✅ |
| **Detention Tracking** | Stops with detention accruing | Phase 3 ✅ |
| **OCR Queue** | Rate cons auto-parsed from email (T9+T10 pending — credentials live) | Phase 3 — T9+T10 |
| **Assignment History** | Audit trail of assignments (T4 pending) | Phase 3 — T4 |
| **At-Risk Loads** | Late >2h OR HOS warning OR maintenance due | Phase 3 ✅ |
| **Settings** | Dispatcher assignments · Default lanes · Auto-routing rules | Owner only |

### KPI row — 6 cards
Active Loads · In Transit · At Risk · Border Decisions Pending · Ready to Settle · MTD Revenue

### Book Load Modal — gate sequence (T11.5.1 LOCKED)
1. Validate inputs
2. **WF-044 advisory check** — open PM-due WO on assigned unit → yellow banner with Continue
3. **WF-050 hard block** — `is_dispatch_blocked = true` → 422 + Owner-only override + critical audit + WF-064 notification
4. **WF-038 HOS check** — driver HOS violation → 422 + Manager+ override + warning audit + WF-064
5. INSERT load + audit event

### UI chips on Dispatch home
- ⚡ icon on unit IDs with open PM-due WOs
- 🔒 icon on units with `is_dispatch_blocked = true`
- HOS badge dot (green/yellow/red) on driver IDs

---

## MODULE 10 — VENDORS

**Route:** `/vendors`
**Phase 1 task:** P1-T5 (shipped — schema + Office UI)
**Phase 3:** No new work (catalog hub for selectors used by other modules)
**Purpose:** Vendor master data — feeds Maintenance + Accounting + Documents

### Top action button
**+ Create Vendor**

### Sub-nav tabs (6)

| Tab | What it shows |
|-----|---------------|
| **All Vendors** | Searchable table |
| **Vendor Detail** | Full profile + bills + WOs + spend trend |
| **Maintenance Vendors** | Filter — those used in `maintenance.work_orders` |
| **Fuel Vendors** | Filter — Loves, TA, Pilot, etc. |
| **Tow / Roadside** | Filter — RT/RS source-type WOs |
| **Settings** | Default payment terms · Default GL accounts |

### KPI row — 5 cards
Active Vendors · MTD Spend · Top 5 by Spend · Open Bills · Avg Days to Pay

### Vendor Detail tabs (within record)
- Profile · W-9 / 1099 · Bills history · WOs received · Spend chart · Integrity flags (price gouging from Phase 6)

---

## MODULE 11 — DOCUMENTS

**Route:** `/docs`
**Phase 2 tasks:** P2-T1 + P2-T2 + P2-T3 (all shipped)
**Phase 3 tasks:** T9 (OCR) + T10 (Email Push) — credentials LIVE in Render
**Purpose:** Centralized document management — every file in one place with chain-of-custody

### Top action button
**+ Upload Document**

### Sub-nav tabs (10 — locked)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **All Documents** | Searchable table | Phase 2 ✅ |
| **By Category** | BOL / POD / RateCon / Invoice / DVIR / Insurance / DriverDoc / etc. | Phase 2 ✅ |
| **Pending Review** | Uploaded from PWA awaiting office action | Phase 2 ✅ |
| **Email Inbox** | Auto-ingested from 5 watched mailboxes (T10 pending — credentials live) | Phase 3 — T10 |
| **OCR Results** | Anthropic-parsed rate cons + extraction confidence (T9 pending) | Phase 3 — T9 |
| **Expiring Soon** | Driver/equipment docs within 30 days of expiry | Phase 6 — P6-T7 |
| **FMCSA Verification Queue** | Broker authority lookups (P2-T4 carryover) | Phase 3 — P2-T4 |
| **Legal Hold** | Records flagged for litigation (override retention) | Phase 2 ✅ |
| **R2 Storage Stats** | Bucket usage + cost | Phase 6 |
| **Settings** | Retention policies · Categories · Auto-tag rules | Owner only |

### KPI row — 5 cards
Total Docs · MTD Uploaded · Pending Review · Expiring 30d · Storage Used (GB)

---

## MODULE 12 — LISTS / CATALOGS

**Route:** `/lists`
**Approved screen:** `9-Lists_and_catalogs.png`
**Phase 1 tasks:** P1-T6, P1-T13, P1-T15, P1-T16, P1-T18 (all shipped)
**Phase 3 task:** T11.14 — editable catalog UI (pending)
**Purpose:** All system catalogs — driver pay codes, deduction codes, locations, etc.

### Top action button
**+ Create Catalog Entry** (varies per active sub-nav)

### Sub-nav tabs (12 — locked)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Driver Pay Codes** | Per-mile / per-load / hourly / bonus codes | Phase 1 ✅ |
| **Driver Deduction Codes** | Equipment / advance / liability / fine codes | Phase 1 ✅ |
| **Equipment Types** | Tractor classes / trailer types | Phase 1 ✅ |
| **Driver Load Statuses** | Custom workflow states | Phase 1 ✅ |
| **Locations** | Pickup/delivery master + geofences | Phase 1 ✅ |
| **Cancellation Reasons** | Catalog used in load cancel flow | Phase 3 ✅ T3 |
| **Expensive States** | IFTA tax avoidance routing | Phase 3 ✅ |
| **Customer Quality Flags** | Pre-set flag values | Phase 1 ✅ T19.5 |
| **Border Routing Profiles** | Northbound/Southbound/Inland templates | Phase 3 ✅ |
| **QBO Catalogs** (placeholder) | Chart of Accounts / Items / Classes — Phase 5 cutover | Phase 5 |
| **Posting Templates** (placeholder) | WF-053 cross-module rules — Phase 5 | Phase 5 |
| **Settings** | Per-catalog config + access control | Owner only |

### KPI row — 4 cards
Total Catalog Entries · Last Modified · Pending Approval · Sync Status

---

## MODULE 13 — REPORTS

**Route:** `/reports`
**Approved screen:** `10-Reports.png`
**Phase 3 task:** T11.16 — Reports hub + Owner dashboard (pending)
**Phase 6 tasks:** P6-T1 through P6-T5 (extended reports)
**Purpose:** Pre-built business reports + custom report builder

### Top action button
**+ Create Custom Report**

### Sub-nav tabs (12)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **P&L Summary** | Per-company income/expense | Phase 3 — T11.16 |
| **IFTA Summary** | Per-state miles/gallons/tax | Phase 3 — T11.16 |
| **Settlements Summary** | Per-driver settlement totals | Phase 3 — T11.16 |
| **Factoring Summary** | Faro/CCG totals · advance vs reserve · chargebacks | Phase 3 — T11.16 |
| **Customer Profitability** | Revenue vs cost per customer | Phase 6 |
| **Lane Profitability** | Revenue vs cost per lane | Phase 6 |
| **Cancellation Analysis** | Why loads cancel + trends | Phase 6 — P6-T3 |
| **Dispatcher Accountability** | Per-dispatcher metrics | Phase 6 — P6-T4 |
| **Customer Disputes** | Aggregated dispute reports | Phase 6 — P6-T5 |
| **Activity Timeline** | Cross-module unified timeline | Phase 6 — P6-T6 |
| **Custom Reports** | User-defined SQL-backed reports | Phase 6 |
| **Settings** | Default date ranges · Export formats · Scheduled email | Owner only |

### KPI row — 5 cards
Reports Generated MTD · Scheduled Reports · Top Lane (revenue) · Top Customer · Top Driver

---

## MODULE 14 — 425C (Ch.11 DIP UST Report)

**Route:** `/form-425c` (legacy alias `/425c`)
**Approved screen:** `11-Form_425-Design.png`
**Phase 3 task:** T11.13 (pending)
**Purpose:** UST monthly operating report — Ch.11 DIP regulatory requirement

### Top action button
**+ Generate New Submission**

### Sub-nav tabs (9)

| Tab | What it shows |
|-----|---------------|
| **Form (Lines 1-37)** | Full monthly operating report form with all 8 parts |
| **Exhibit A** | Explanations for Part 1 "No" answers (lines 1-9) |
| **Exhibit B** | Explanations for Part 2 "Yes" answers (lines 10-18) |
| **Exhibit C (auto)** | Cash receipts detail auto-derived from Banking |
| **Exhibit D (auto)** | Cash disbursements detail auto-derived from Banking |
| **Exhibit E (auto)** | Payables aging sourced from Accounting bills |
| **Exhibit F (auto)** | Receivables aging sourced from Accounting invoices |
| **Merge & Export** | Generate filing PDF package for manual court upload |
| **Filing History** | All prior reports with filed/amended status timeline |

### KPI row — 5 cards
Days to Next Submission · Current Period Cash Receipts · Current Period Disbursements · YTD Operating Loss/Profit · Compliance Status

### CRITICAL invariant
- Virtual banks (Factoring · Escrow) EXCLUDED from main bank totals on lines 19-23 per UST guidance

---

## MODULE 15 — DRIVER PWA

**Route:** Separate app at driver-app.ih35dispatch.com
**Approved screen:** `12-App_Design.png`
**Phase 1+2 tasks:** P1-T14 + P1-T17 (OTP) + P2-T3 (offline upload — shipped)
**Phase 3 task:** T11.15 — settlements view + expense upload (pending)
**Phase 4 tasks:** P4-T2 (offline-first) · P4-T3 (Push) · P4-T4 (in-app messaging) · P4-T5 (Spanish) · P4-T6 (damage reporting)
**Purpose:** Driver-facing mobile experience

### Top tabs (mobile-friendly bottom nav — 5)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Today's Loads** | Current + next assignment | Phase 1 ✅ |
| **Documents** | Upload BOL/POD/scale ticket | Phase 2 ✅ |
| **Settlements** | View latest settlement + paystub PDF | Phase 3 — T11.15 |
| **Expenses** | Submit expense for reimbursement | Phase 3 — T11.15 |
| **Inbox** | Acks · messages · notifications | Phase 4 — P4-T4 |

### Hidden flows (accessed from buttons within tabs)
- **Report Issue** (in-transit problem) → creates `dispatch.intransit_issues` row per WF-048
- **Report Accident** → creates `safety.accident_reports` row per WF-005
- **Acknowledge Liability** → signs ack per WF-036
- **Pre-Trip / Post-Trip DVIR** → submits DVIR per WF-050

---

## MODULE 16 — LEGAL / CONTRACTS

**Route:** `/legal`
**Approved screen:** pending formal PNG pack (Phase 8A new-spec approval)
**Phase 8A tasks:** PR1 schema + template library, PR2 e-sign + PDF rendering, PR3 settlement bilingual mode, PR4 office legal UI, PR5 attorney review portal
**Purpose:** Attorney-reviewed contract template control, signer workflows, immutable legal evidence trail

### Top action button
**+ Create Contract**

### Sub-nav tabs (6 — Phase 8A + Phase 8C matters)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Contracts** | Contract instances by signer/status with send + tracking actions | Phase 8A |
| **Templates** | Versioned legal template library with review status lifecycle | Phase 8A |
| **Policies** | Policy acknowledgment templates and status rollups | Phase 8A |
| **Attorney Review** | Submitted templates awaiting legal approval decision | Phase 8A |
| **Matters** | Lawsuits / claims / deadlines tracker (privilege-aware documents) | Phase 8C |
| **Reports** | Legal matters rollups (severity, exposure, settlements, deadlines) | Phase 8C |

### Template status lifecycle (LOCKED)
`draft -> pending_review -> approved -> active -> retired`

Rules:
- Templates seed as `draft` only.
- Contracts cannot be created from non-`active` templates.
- `attorney_approved_by` and `attorney_approved_at` remain null until attorney review completion.

### E-sign + evidence invariants (Phase 8A)
- Signing tokens are single-use and expire after 30 days by default.
- Every legal event records IP + user-agent.
- Audit trail is append-only and blocks UPDATE/DELETE mutations.
- Spanish legal text is never machine-translated for final production legal use.

---

## CROSS-CUTTING CONCERNS

### Permanent rules (LOCKED in `docs/specs/CURSOR-PERMANENT-RULES.md` at `66de8d4`)
- Dual-source spec law (formal blueprint + unified additions)
- Approved-screen review before UI build
- Phase 3 = UI/UX shell only (deeper integrations later)
- Locked invariants (RLS, security_invoker, audit, etc.)
- Display ID formats LOCKED including WO with V5 vendor suffix
- Respond-before-code protocol
- Post-push confirmation
- "+ Create / + Book" button rule

### Cross-module data flow examples
1. **Driver reports in-transit issue** → `dispatch.intransit_issues` → Maintenance "Promote to WO" → `maintenance.work_orders` (source_type per category) → Bill in Accounting → JE → if driver liable: `driver_liabilities` → Settlement deduction → Bill payment → 425C line update
2. **Accident on road** → Driver PWA Report Accident → `safety.accident_reports` → Office Spawn WO → `maintenance.work_orders` source_type='AC' → Spawn Liability → `driver_liabilities` → Ack via WhatsApp → driver signs → Settlement deduction → Bill payment
3. **Fine received** → Safety Fines tab → Convert to Liability → `driver_liabilities` per WF-035 → Ack request → settlement deduction
4. **Vendor invoice price gouging** → `parts_invoice_links` populated → Phase 6 alert engine queries `views.maintenance_vendor_history` → flags vendor → Safety Integrity Alerts panel → Owner notification → Owner dismisses or actions

---

## PHASE MAPPING — what ships when

| Phase | Status | What gets shipped |
|-------|--------|-------------------|
| Phase 0 | ✅ DONE | Foundation (repo, hosting, CI/CD) |
| Phase 1 | ✅ DONE | Identity + multi-tenant + master data + Office UI for Drivers/Customers/Vendors/Lists |
| Phase 2 | ✅ DONE | Documents schema + R2 + Office UI tabs + PWA upload |
| **Phase 3** | 🔄 67% (Day 4) | All 12 module UI shells + cleanup gates + WO format + integrity views + arriving-soon queue |
| Phase 4 | ⏸ | Samsara live · PWA expansion · Web Push · Spanish · Damage reporting · Comdata API · Wire outbound · Above-policy approval · Forfeiture flow |
| Phase 5 | ⏸ | Banking schema deep · Faro reconciliation · CCG sweep · Settlements full · Customer credits · Invoice gen · QBO sync · Factor switching · Posting service |
| Phase 6 | ⏸ | Reports + customer scoring + cancellation analysis + dispute reports + activity timeline + doc expiration alerts + e-signature + RMIS + Spanish office i18n + **P6-T-INTEGRITY alert engine (NEW from Jorge chat)** |
| Phase 7 | ⏸ | Backup/DR · Always Track import · Production Twilio · QBO prod · Pen test · Load test · Training materials · Cutover · Launch · Post-launch monitoring |
| Phase 8A | 🔄 IN PROGRESS | Legal/contracts module · template lifecycle · e-sign flow · bilingual legal rendering · attorney review portal |

---

## ADDENDUM — P7 Wave 2 v3 (bidirectional QBO + banking review) — 2026-05

**Schema note:** Operational bank movements live in `banking.bank_transactions` (not `banking.transactions`). Wave 2 review columns and reconciliation linkage attach there.

**Inbound sync:** `integrations.qbo_inbound_events` stores verified webhook payloads (HMAC-SHA256 of raw body vs `intuit-signature`, verifier `QBO_WEBHOOK_VERIFIER`). Realm → company resolves via `integrations.qbo_connections.realm_id`. The inbound worker marks rows fetched/applied, creates short-lived `qbo_archive.import_batches` rows, and inserts forensic `qbo_archive.entities_snapshot` rows before TMS-side conflict merging is expanded.

**Conflicts:** `integrations.qbo_sync_conflicts` holds TMS vs QBO snapshots; finance roles resolve via REST; `tms_wins` re-enqueues affected entities on the outbound queue.

**Bank review:** `accounting.banking_rules` drives tier‑1 suggestions via `banking/banking-rules.engine.ts` (runs after new Plaid-synced and CSV-import `banking.bank_transactions` inserts; priority `DESC`, first match wins). Tiers 2–4 (vendor/history/PFC) remain in `banking/suggestion-engine.ts` when no rule matches.

**Reconciliation:** Canonical sessions remain `banking.reconciliation_sessions` (extended statuses include `finalized` / `reopened`). Parallel REST paths live under `/api/v1/banking/reconciliation-sessions/*` alongside legacy `/api/v1/banking/reconciliation/*`.

**Period close:** `accounting.periods` plus triggers raising `IH35_CLOSED_PERIOD …` enforce locked fiscal periods (HTTP **423** when surfaced through API mappers).

**Outbound sync:** `integrations.qbo_sync_queue` remains the single outbound writer queue (extended with `idempotency_key`, `payload_jsonb`, `triggered_by`, and `dead_letter` status). Bank-transaction purchases continue to use `min(30s×2^(n−1), 1h)` backoff inside `qbo-sync.service.ts`; Wave 2 **accounting entity** outbound failures use `min(60s×2^(attempt+1), 3600s)` computed in `sync-outbound-accounting.ts`.

### Outbound writer dispatcher (Wave 2 close-out)

**Fan-out:** `processOutboundSyncWorkerTick` → `processSyncQueueBatch` claims pending rows → for accounting entities (`invoice`, `bill`, `bill_payment`, `journal_entry`, `payment`, `credit_memo`, `factoring_advance`, `expense`) calls `syncEntityToQbo` (`apps/backend/src/integrations/qbo/sync-outbound-accounting.ts`). Each entity routes through `buildAccountingOutboundPayload` (`sync-outbound-accounting.entities.ts`) → thin **`buildQbo…Payload`** translators under `apps/backend/src/integrations/qbo/translators/` (pure JSON builders; no DB reads).

**Idempotency key:** When `integrations.qbo_sync_queue.idempotency_key` is null on first attempt, the dispatcher derives  
`sha256(\`${operating_company_id}:${entity_type}:${entity_id}:${version_int}:${last_entity_touch_iso}\`).slice(0,40)`  
and persists it on the queue row so retries reuse the same `Idempotency-Key` HTTP header.

**Advisory lock:** Before reads/writes, `SELECT pg_try_advisory_xact_lock(hashtext(:operating_company_id || ':' || :entity_type || ':' || :entity_id))` prevents concurrent workers from mutating the same TMS entity inside one DB transaction (held across the QBO HTTP round-trip per dispatch).

**HTTP:** Requests target `https://quickbooks.api.intuit.com/v3/company/<realm>/<entityPath>?minorversion=70` with Intuit OAuth bearer tokens (`getValidAccessToken` / `refreshAccessToken` on `401` once).

**Response handling (accounting outbound)**

| HTTP | Queue / TMS outcome |
|------|---------------------|
| **200** | Persist returned `Id` + `SyncToken` on both TMS row (`qbo_*_id`, `qbo_sync_token` where columns exist) and queue row; `sync_status='synced'` |
| **401** | Refresh tokens once; repeat **401** → insert `qbo_sync_conflicts` (high), queue `blocked`, OAuth revoked when refresh returns invalid_grant |
| **409** | Stale `SyncToken` → GET remote snapshot, insert conflict row (high), queue `blocked` (`error_message='stale_sync_token'`) |
| **422** | Validation fault → conflict row (medium), queue `failed` then `dead_letter` after repeated failures (`attempt_count` threshold) |
| **Other 4xx / 5xx / 429** | Queue returned to `pending` with exponential backoff window above; `dead_letter` once attempts exhaust guard |

**Factoring advances:** Posted as **JournalEntry** rows in QBO; queue payload may carry `{ cash_account_qbo_id, liability_account_qbo_id }` until catalog bindings mature.

**Recurring templates cron** — Materializes invoice/bill/journal/expense rows then **always** enqueues `integrations.qbo_sync_queue` via `enqueueSyncJob(..., { triggered_by: 'recurring_template', payload_jsonb })` so invoice/bill/expense parity matches journal entries.

**Inbound CDC + replay** — Cron `qbo_cdc_poll` (5 min) calls QuickBooks `GET …/cdc` for env-configured realms (`QBO_REALM_ID_TRK`, `QBO_REALM_ID_TRANSP`), `changedSince` = max prior CDC/replay `qbo_last_updated_time` from `integrations.qbo_inbound_events`. Owner-only `POST /api/v1/admin/sync/inbound/replay-since` `{ since_iso, realm }` replays ingest; HTTP **410** cursor expiry resets to epoch replay once.

**Year-end retained earnings JE** — When `period_end` is Dec 31, close aggregates posted postings joined to `catalogs.accounts`: clears Income / Expense / COGS / Other* buckets into `catalogs.account_role_bindings.role_key = 'retained_earnings'` (fallback: first Equity account).

**Admin sync health** — `GET /api/v1/admin/sync/health` (Owner/Administrator) returns realm linkage JSON plus CDC timestamps (`realms[]`, `last_cdc_poll_at_per_realm`, `recurring_templates_due_now`, `next_period_close_company`) cached ~30s.

**Roles / RLS:** Integration additions reuse `ih35_app` grants + office-role SELECT mirrors (`integrations.integration_sync_log` pattern).

**Removed gaps (this branch):** Bill preview IDs, journal-only recurring enqueue, and `unsupported_entity_type_*` throws for the Wave 2 accounting entities are eliminated—the dispatcher + translators own live POST/PATCH with conflict recording (`integrations.qbo_sync_conflicts`).

### Local QBO customer push scheduler (B8 — 2026-06)

**Problem:** ~2,655 TMS-origin customers exist in `accounting.qbo_customers` (cloned from `mdata.qbo_customers`) with `qbo_id IS NULL`.

**Schema (`0319`):** `accounting.qbo_customers` gains `sync_status` (`unsynced|pushing|synced|failed`), `qbo_push_attempts`, `qbo_last_push_at`, `qbo_last_error`, partial index on `(sync_status, qbo_push_attempts) WHERE qbo_id IS NULL`, tenant RLS, and `audit.row_changes.action` for `qbo_push` attempt rows.

**Worker:** `apps/backend/src/sync/qbo-customers-push.ts` ticks every **60s**, claims up to **100** rows (`FOR UPDATE SKIP LOCKED`), enforces **100/min** rolling rate limit per process, dead-letters after **5** failed attempts, mirrors row into `mdata.qbo_customers`, then reuses `deliverQboMasterEntityPush` (`entity=customer`, `operation=create|update`).

**Observability:** `GET /api/v1/sync/qbo-customers/status?operating_company_id=` returns `{ total_local, synced, unsynced, pushing, failed, dead_letter }`; Office HOME QBO Sync Health card surfaces pending/synced customer counts.

### Local QBO vendor push scheduler (B9 — 2026-06)

**Problem:** ~2,744 TMS-origin vendors exist in `accounting.qbo_vendors` (cloned from `mdata.qbo_vendors`) with `qbo_id IS NULL`.

**Schema (`0321`):** `accounting.qbo_vendors` gains `sync_status`, `qbo_push_attempts`, `qbo_last_push_at`, `qbo_last_error`, vendor push fields (`eligible_1099`, `payment_terms_qbo_id`, `default_ap_account_qbo_id`), partial index on `(sync_status, qbo_push_attempts) WHERE qbo_id IS NULL`, tenant RLS, and `audit.row_changes.action='qbo_push'` attempt rows.

**Worker:** `apps/backend/src/sync/qbo-vendors-push.ts` ticks every **60s**, claims up to **100** rows, shares the **100/min** rolling rate budget with B8 via `qbo-master-push-rate-limit.ts`, dead-letters after **5** failed attempts, mirrors row into `mdata.qbo_vendors` (1099 / payment terms / default AP account in payload), then reuses `deliverQboMasterEntityPush` (`entity=vendor`, `operation=create|update`).

**Observability:** `GET /api/v1/sync/qbo-vendors/status?operating_company_id=` (withCurrentUser-scoped) returns the same count JSON; Office HOME QBO Sync Health card surfaces pending/synced vendor counts alongside customers.

### Local QBO chart of accounts push scheduler (B10 — 2026-06)

**Problem:** ~1,282 TMS-origin chart-of-accounts rows exist in `accounting.qbo_accounts` (cloned from `mdata.qbo_accounts`) with `qbo_id IS NULL`.

**Schema (`0323`):** `accounting.qbo_accounts` gains `sync_status`, `qbo_push_attempts`, `qbo_last_push_at`, `qbo_last_error`, `parent_synced`, `parent_id`, partial index on `(sync_status, qbo_push_attempts) WHERE qbo_id IS NULL`, tenant RLS, and `audit.row_changes.action='qbo_push'` attempt rows.

**Worker:** `apps/backend/src/sync/qbo-accounts-push.ts` ticks every **60s**, runs **parent-first** two-pass claims (roots with `parent_id IS NULL`, then children whose parent has `qbo_id`), batch up to **100** per pass, shares the **100/min** rolling rate budget with B8+B9 via `qbo-master-push-rate-limit.ts`, dead-letters after **5** failed attempts, mirrors row into `mdata.qbo_accounts` with `ParentRef`, then reuses `deliverQboMasterEntityPush` (`entity=account`, `operation=create|update`).

**Observability:** `GET /api/v1/sync/qbo-accounts/status?operating_company_id=` returns `{ total_local, synced, unsynced, pushing, failed, dead_letter, root_synced, children_synced, blocked_by_parent }`; Office HOME QBO Sync Health card surfaces pending/synced account counts.

---

## ADDENDUM — 2026-05-21 Data Sovereignty + Telematics capability architecture

### A. Data Sovereignty architecture layer

The architecture enforces a strict split:

- **Local Read Layer:** operational UI/API requests read from local persisted models only.
- **Sync/Ingest Layer:** pollers, webhook handlers, replay workers, and reconciliation workers hydrate and validate local mirrors asynchronously.

Reference flow:

1. Third-party poll/webhook ingest
2. Append-only event persistence
3. Projection/materialization to local mirrors/read models
4. Operational reads from local models only
5. Async reconciliation + drift-finding logging

Design-detail policy for this addendum is invariant-first: canonical architecture text locks boundaries and workflow contracts, while most concrete DDL and fixed thresholds remain implementation-spec concerns.

### B. Telematics capability architecture (CAP-1..CAP-15)

Core contexts:

- dispatch telematics status derivation
- fuel HOS-constrained planning
- maintenance predictive signals
- safety scoring/incident integration
- identity integrity validation across systems

Event contract family:

- `telematics.position_updated`
- `telematics.geofence_event_received`
- `telematics.status_transition_inferred`
- `telematics.dtc_fault_detected`
- `maintenance.auto_wo_candidate_created`
- `safety.driver_score_recomputed`
- `integrity.mapping_violation_detected`

### C. CAP-13 locked schema shape (lock-now decision)

The CAP-13 architecture locks the core schema objects and outcome enum set now.

```sql
CREATE TABLE catalogs.dot_inspection_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_name text NOT NULL,
  state_code text NOT NULL,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('state_dps','state_police','port_of_entry','federal','other')),
  highway_designation text NOT NULL,
  center_lat numeric(10,7) NOT NULL,
  center_lng numeric(10,7) NOT NULL,
  radius_feet integer NOT NULL DEFAULT 500,
  dwell_threshold_minutes integer NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  samsara_geofence_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE safety.dot_inspection_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  station_id uuid NOT NULL REFERENCES catalogs.dot_inspection_stations(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid REFERENCES mdata.drivers(id),
  dispatch_id uuid REFERENCES dispatch.dispatches(id),
  entry_at timestamptz NOT NULL,
  exit_at timestamptz,
  dwell_minutes integer NOT NULL,
  outcome_status text NOT NULL DEFAULT 'unknown' CHECK (outcome_status IN
    ('unknown','no_action','warning_issued','fine_pending','fine_received','false_positive')),
  outcome_recorded_at timestamptz,
  outcome_recorded_by_user_id uuid REFERENCES identity.users(id),
  related_fine_id uuid REFERENCES safety.fines(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Workflow expectations for CAP-13 remain locked:

- station geofence catalog provisioning
- dwell detection and visit persistence
- unresolved visit alerting for stale outcomes
- fine-link path to `safety.fines`

Seed geography and threshold tuning are implementation-managed, not hardcoded further in canonical architecture text.

## Vehicle Profile (Maintenance module) — Part 1 (locked 2026-06-02)

Route: `/fleet/units/:id` renders `VehicleProfilePage` with six sections (identity/status, live telemetry, driver assignment, current load, maintenance snapshot, compliance). Sections 7–11 are Block 12.

**Status enum (5 lifecycle + maintenance):** `InService` (Active), `OutOfService` (OOS), `InMaintenance`, `Sold`, `Damaged`, `Transferred`. Legacy `Totaled` migrates to `Damaged`. Status changes are **additive** (archive via `deactivated_at`, never hard-delete units).

**Quick availability** (`available` | `booked` | `holding`) is independent of lifecycle status and toggled via `POST /api/v1/mdata/units/:id/quick-availability`.

**Dual-driver tracking** uses existing `telematics.vehicle_driver_assignments`: `is_default=true` manual default vs `source='samsara_webhook'` current driver from webhooks (`processVehicleDriverPairingWebhookEvent`). No parallel `mdata` assignment table.

**Multi-plate** support: `mdata.unit_plates` with US state/territory + MX Federal/32-state validation.

**Samsara refresh:** React Query `staleTime`/`refetchInterval` 30s on telemetry blocks; aggregate reads `integrations.samsara_vehicles`, `telematics.vehicle_latest_position`, parsed odometer/faults from `raw_payload`.

**Audit:** App-layer `appendCrudAudit` on `PATCH /api/v1/mdata/units/:id` — action `mdata.unit.status_changed` when `status` changes; profile context fields included in payload. No DB trigger on `audit.events`.

**Edit Vehicle modal (Block A6):** Fleet Table row **Edit** opens `EditVehicleModal` with eight tabs — Identity, Insurance, IRP / Plates, Reefer (conditional on trailer linkage), Financial, Lifecycle (Sold / Transferred / Damaged / OOS sub-sections by status), Quick-availability, Documents. Surfaces 50+ `mdata.units` columns via reusable `FormField` / `FieldSet`; diff-only PATCH with Owner RBAC on sale/transfer/damage-cost fields; schema allowlist in `unit-update-schema.ts` (58 patchable columns derived from information_schema).

**Modal doubling guard (Block A9):** Shared `Modal` renders the sole `<h2>` title. Feature modals (`WorkOrderDetailModal`, `CustomerEditModal`, etc.) MUST NOT add inner `<h1–h3>` headings that duplicate the `title` prop. `CustomerEditModal` inputs require `name` attributes (no ghost fields). Enforced by `verify-modal-no-doubled-header.mjs` + vitest.

**Modal X-close audit (Block A15):** Every `*Modal.tsx` must expose a top-right **×** close control with `role="button"` and `aria-label` beginning with `Close ` plus the modal title (via shared `Modal`, `ModalCloseButton`, or equivalent). Clicking ×, Escape, and backdrop (when applicable) must invoke `onClose`. Opt-out overlays declare `// @ModalNoX` (e.g. inline panels that are not dismissible dialogs). Inventory (2026-06): 73 `*Modal.tsx` files under `apps/frontend/src`; custom overlays refactored to shared `Modal` or `ModalCloseButton` include `BookLoadModalV4`, `FaultRuleModal`, `LaneDetailModal`, `AbandonmentReportModal`, cash-advance dialogs, and driver `ReportIssueModal`. Guards: `verify-all-modals-have-x-close.mjs` + `modal-x-close-audit.test.tsx`.

**Maintenance alerts banner:** Server-built `maintenance_alerts[]` (high/medium/low); dismissible per session in UI.

## Vehicle Profile (Maintenance module) — Part 2 (locked 2026-06-02)

Sections 7–11 on `VehicleProfilePage`: reefer (conditional), financial P&amp;L, recent activity, documents, action bar. Recommendations: PDF export, trip cost calculator, photo gallery, ownership cost meter, comparable units widget.

**Reefer:** Trailer-level only — `mdata.equipment` reefer columns (migration `0296`); Section 7 when `equipment_type = 'Reefer'` and `current_unit_id` = unit. Not on `mdata.units`.

**Documents:** Reuse `docs.files` + `docs.file_links` (`entity_type='unit'`). No `mdata.unit_documents`. Upload via existing docs module; profile lists via `GET /api/v1/mdata/units/:id/documents`.

**Photos:** `mdata.unit_photos` for driver-app gallery; web read-only V1.

**Financial:** `unit-financial.service.ts` reuses profit-per-truck CTE joins (`assigned_unit_id`, `driver_finance.driver_bills`, `fuel.fuel_transactions` via `load_id`, `maintenance.work_orders`). In-memory 5min TTL cache. `GET /api/v1/mdata/units/:id/financial?period=YTD|quarter|month`.

**PDF export:** Puppeteer HTML → `page.pdf()` (same pattern as settlement PDF renderer). `GET /api/v1/mdata/units/:id/export.pdf`.

## Driver Profile (People module) — Part 1 (locked 2026-06-01)

Route: `/drivers/:id/profile` renders `DriverProfilePage` with six sections (identity, license/endorsements, medical card, drug program, HOS, current assignment). Full driver record remains at `/drivers/:id` (`DriverDetailPage`).

**License:** `mdata.drivers` CDL fields + six endorsement booleans (`0297`). Medical prefers `safety.medical_cards` with fallback to `dot_medical_expires_at`.

**Drug:** Latest `safety.drug_test`; random pool from `safety.random_pool` open rows.

**HOS:** `hos.duty_status_events` + `getCurrentClocks` (not hardcoded). UI refetch 30s on section 5.

**Default truck:** Symmetric to unit default-driver — `POST /api/v1/mdata/drivers/:id/default-truck` and `clear-default-truck` on `telematics.vehicle_driver_assignments.is_default`.

## Driver Profile (People module) — Part 2 (locked 2026-06-02)

Extends aggregate + `DriverProfilePage` with sections 7–12: performance scorecard (`safety.harsh_events` + fleet rank), settlements (`payroll.driver_settlements`), training (`safety.training_records` CRUD under `/api/v1/mdata/drivers/:id/training`), border credentials (FAST/SENTRI/TWIC/passport/MX license/B1 on `mdata.drivers` migration `0302`), documents (`docs.file_links` entity_type `driver`), sticky action bar (edit, assign truck, message, map, PDF, suspend/terminate).

**PDF export:** `GET /api/v1/mdata/drivers/:id/export.pdf` via Puppeteer (`driver-profile-pdf-renderer.service.ts`).

**Messages V1:** `POST /api/v1/mdata/drivers/:id/messages` persists to `mdata.driver_profile_messages` (delivery integration deferred).

## Trailer Profile (Fleet module) — Part 1 (locked 2026-06-02)

Route: `/fleet/trailers/:id` renders `TrailerProfilePage` with eight sections (identity/status, type specs, assignment, conditional reefer telemetry, maintenance, compliance/plates, documents, action bar). Parallel to Vehicle Profile; data on `mdata.equipment` + `mdata.equipment_plates` (migration `0303`).

**Aggregate:** `GET /api/v1/mdata/equipment/:id?operating_company_id=` returns full trailer profile envelope.

**PDF:** `GET /api/v1/mdata/equipment/:id/export.pdf` via Puppeteer.

## Trailer Profile (Fleet module) — Part 2 gap-fill (B16, 2026-06-03)

No migration. UX and API hardening on Part 1 data layer.

- **Status change:** `PUT /api/v1/fleet/trailers/:id/status` with reason, optional note/effective date, lifecycle fields (sold/transfer/damage/OOS). Validated by `apps/backend/src/fleet/trailer-status-state-machine.ts` (terminal `Sold`/`Transferred`/`Lost`; `Sold→InService` only with Owner `admin_override`). Audits `fleet.trailer.status_changed`.
- **Edit:** `PATCH /api/v1/fleet/trailers/:id` via `EditTrailerModal` (identity, specs, insurance, notes). Audits `fleet.trailer.updated` with before/after diff.
- **UI:** `StatusChangeModal`, status badge dropdown on `IdentityStatusHeader`, `TrailerReeferSection` A19 stub (conditional `equipment_type=Reefer`), `TrailerRecentActivitySection` (equipment log, docs files, WO list via attached unit).
- **CI:** `verify:trailer-status-state-machine-coverage`, `verify:trailer-profile-no-stub-sections`.

## Compliance Dashboard (Safety module) — Block 16 (locked 2026-06-02)

Route: `/compliance` renders `ComplianceDashboardPage` — master view of expiring credentials across units, trailers, drivers, plates, and carrier-level fields.

**Aggregate:** `GET /api/v1/compliance/dashboard` and `/summary` via `compliance-aggregate.service.ts` (migration `0304`: `compliance.notification_rules`, `compliance.notification_log`).

**Reminders:** Daily cron at 06:00 America/Chicago (`compliance-reminder.job.ts`); rules CRUD under `/api/v1/compliance/notification-rules`.

## Shipper Portal (Customers module) — Block 18 (locked 2026-06-02)

Route prefix: `/portal/*` — separate customer-facing auth (`portal_session` cookie) scoped to one `mdata.customers` record per portal user.

**V1 tracking (option B):** No tile map library. Load detail shows lat/lng text, relative location label, last GPS update age, and a vertical milestone timeline. Positions read server-side from `telematics.vehicle_latest_position`.

**API:** `/api/v1/portal/auth/*`, `/api/v1/portal/loads`, load detail/documents/SSE tracking, profile prefs. Internal admin manages portal logins on customer profile (`Portal Users` tab) via `/api/v1/customers/:id/portal-users`.

**Milestones + email:** `shipper_portal.load_milestones` synced from load status; milestone emails use `portal-*.eta` templates when portal user notification prefs allow.

## Lane Profitability Heatmap (Reports module) — Block 19 (locked 2026-06-02)

Route: `/reports/lane-profitability` renders `LaneProfitabilityPage` — corridor P&L by origin/destination city-state with color-coded margin table, profit/mile bar chart, CSV export, and lane drill-down modal (last 20 loads).

**Data:** `mdata.loads` joined to first pickup / last delivery `mdata.load_stops`; costs from `driver_finance.driver_bills`, `maintenance.work_orders`, and `fuel.fuel_transactions` by `load_id`. Cached in `reports.lane_profitability_cache`; monthly rollup materialized view `reports.lane_metrics_monthly` (migration `0311`).

**API:** `GET /api/v1/reports/lane-profitability?period=YTD|quarter|month|custom&start=&end=`, `GET /api/v1/reports/lane-profitability/loads?...` for lane drill-down.

**Jobs:** Nightly refresh 02:00 America/Chicago (`lane-profitability-refresh.job.ts`) for trailing 12 months.

**Downstream:** Block 20 deadhead backhaul suggestions read `reports.lane_profitability_cache`.

## Deadhead Optimization (Reports module) — Block 20 (locked 2026-06-02)

Route: `/reports/deadhead` renders `DeadheadReportPage` — fleet deadhead %, miles, estimated cost, per-truck ranking, weekly trend drill-down.

**Data:** `mdata.loads` columns `loaded_miles`, `deadhead_miles_to_pickup`, `deadhead_miles_calculation_method` (`samsara` | `manual` | `estimated`) plus legacy `miles_deadhead`. Weekly cache in `reports.deadhead_cache` (migration `0308`).

**API:** `GET /api/v1/reports/deadhead?period=last_4_weeks|last_12_weeks|YTD`, `GET /api/v1/reports/deadhead/suggestions/:unit_id` (queries `reports.lane_profitability_cache` from Block 19 for profitable backhauls near last delivery city).

**Jobs:** Weekly refresh Monday 03:00 America/Chicago (`deadhead-refresh.job.ts`).

**Vehicle profile:** `BackhaulSuggestionsWidget` embeds when `quick_availability = available` and no active load.

## Notification Center (Operations module) — Block 17 (locked 2026-06-02)

Route: `/notifications` renders `NotificationCenterPage`; bell icon with unread badge in top nav (`NotificationBell` in `Topbar`).

**Storage:** migration `0309_notification_center.sql` — `notifications.user_notifications` (per-user RLS) + `notifications.user_notification_preferences`.

**API:** `/api/v1/notifications` (list, unread count, read, dismiss, mark-all-read), `/api/v1/notifications/preferences`, optional SSE `/api/v1/notifications/stream`.

**Sources wired V1:** compliance reminder cron (`in_app` channel) and maintenance PM alert creation (`maintenance-predictor.service.ts`).

## Border Crossing Wizard (Dispatch module) — Block 21 (locked 2026-06-02)

Route: `/dispatch/border-crossing` renders `BorderCrossingWizardPage` (6-step wizard); history at `/dispatch/border-crossing/history`.

**Data:** extends `mdata.unit_border_crossings` (migration `0313`) with wizard fields; `reference.ports_of_entry` (Laredo-region seed); `reference.cbp_wait_times_cache` (5-min TTL).

**API:** `POST /api/v1/border-crossing/wizard`, `GET /api/v1/border-crossing/ports-of-entry`, `GET /api/v1/border-crossing/wait-times?cbp_port_code=`, `GET /api/v1/border-crossing/customs-brokers`, `GET /api/v1/border-crossing/history`, `GET /api/v1/border-crossing/:id/emanifest.pdf`.

**FAST card:** wizard reads `mdata.drivers.fast_card_expiration` (Block 14) and warns when missing/expired; persists `driver_fast_card_verified`.

**eManifest V1:** printable PDF via puppeteer (`emanifest-pdf-renderer.service.ts`). ACE API integration (V2) requires CBP enrollment + partner like BorderConnect.

**Jobs:** CBP wait times refresh every 5 min during 06:00–22:00 America/Chicago (`cbp-wait-times-refresh.job.ts`).

**UI:** `CbpWaitTimesWidget` on Dispatch home and wizard sidebar; customs broker selector uses `mdata.vendors` with `vendor_category = 'customs_broker'`.

## Predictive Auto-WO from Faults (Maintenance module) — Block 22 (locked 2026-06-02)

High-severity Samsara fault codes can auto-create **draft** work orders when `maintenance.fault_code_severity_rules.auto_create_wo = true` and severity is `high` or `critical`. Fleet managers review drafts at `/maintenance/fault-drafts`; rules CRUD at `/maintenance/fault-rules`.

**Webhook path:** `vehicle-projector.ts` → `fault-code-processor.service.ts` parses `faultCodes` / `dtc_codes` from Samsara payload, writes `maintenance.samsara_fault_code_history` (idempotent on `raw_event_id`), creates `maintenance.work_orders` with `origin = fault_auto`, `status = draft`. 24h dedupe prevents duplicate WOs for the same unresolved code on the same unit.

**Notifications:** Block 17 `emitPredictiveAutoWoNotifications` → `maintenance_alert` to Owner/Administrator/Manager with link `/maintenance/work-orders/:id` (`source_block = predictive_auto_wo`).

**Initial rule set is empty** — users build their own based on operational experience. Future block: seed industry-standard J1939 DTC severity database.

**Migration:** `0310_predictive_auto_wo.sql` — `fault_code_severity_rules`, `samsara_fault_code_history`, WO origin columns.

## Home Driver Day Summaries empty-state pattern — Block A7 (locked 2026-06-02)

The `/home` **Driver day-summaries** card calls `GET /api/v1/telematics/driver-day-summary?operating_company_id=<uuid>&date=YYYY-MM-DD`. The API returns `{ date, has_data, rows[] }` where `has_data === false` means no telematics/HOS activity for that date (HTTP 200, zero-shaped rows). The widget renders a neutral gray empty state for `has_data:false` — never red. Red styling and a **Retry** button appear only for true fetch failures (network or HTTP 5xx).

## URL routing normalize (underscore → hyphen) — Block A10 (locked 2026-06-02)

Legacy bookmarked URLs that use underscores in path segments (for example `/lists/driver/pay_rate_templates`) previously matched the catch-all `/lists/:domain/:catalogKey` stub route. Canonical catalog routes use hyphens only (for example `/lists/driver/pay-rate-templates`).

**Backend:** `apps/backend/src/middleware/url-canonicalize.ts` — on GET/HEAD, when the request path contains `_` and the hyphen equivalent matches a registered static route, respond **301** with `Location` preserving query string. Intentional underscore paths such as `/api/v1/_healthcheck` are exempt.

**Frontend:** `App.tsx` wraps routes with `useUrlCanonicalize()` — on pathname change, replace `_` with `-` and `navigate(..., { replace: true })` when the hyphen path exists in the manifest static route set.

**CI:** `verify:no-underscore-canonical-routes` scans `manifest.tsx` + `apps/frontend/src/pages/**` and fails if any canonical route path is registered with underscores (legacy redirect maps in `ListsHubPage` are allowlisted).

## Equipment types catalog deduplication — Block A11 (locked 2026-06-02)

Duplicate `catalogs.equipment_types` rows from mixed seed conventions (for example `DRY-VAN` vs `DRY_VAN`, `OVERSIZE` vs `OVERSIZED`) are merged in migration `0318`: FK references repointed, duplicates archived via `deactivated_at` (ledger table `equipment_types_dedup_ledger_0318` preserves rollback mapping). POST equipment types rejects normalized code/name collisions (409). Office list UI never renders archived rows. **CI:** `verify:equipment-types-no-collision` queries active rows and fails on duplicate normalized keys.

LISTS hub domain ribbon header counts derive from `GET /api/v1/lists/<module>/count`, summing active catalog rows with the same default filters as each sub-page listing (not catalog-cardinality from `views.catalogs_inventory`). Frontend `useModuleCount()` uses TanStack Query with 60s `staleTime`. **CI:** `verify:no-hardcoded-list-counts` fails on hardcoded header badge integers in hub ribbon components.

## Drivers reference catalogs — Block A17 (locked 2026-06-03)

**Canonical pattern:** global `reference.*` lookup tables with `archived_at` soft-archive (same convention as migrations 0318, 0320, 0325). No company scope; additive archive only (never delete rows).

Five driver sub-catalogs under `/lists/drivers/*` read from `reference.license_classes`, `reference.cdl_endorsements`, `reference.cdl_restrictions`, `reference.medical_card_statuses`, and `reference.employment_statuses` (migration `0340_reference_driver_lookups.sql`). Backend routes: `GET|POST /api/v1/lists/drivers/<subcatalog>`, `PATCH /:id` (update), `POST /:id/archive`, `POST /:id/restore`. List default filter: `archived_at IS NULL`; `?include_archived=true` shows archived rows.

Orphan `catalogs.*` driver lookup tables (e.g. `catalogs.driver_license_classes`, `catalogs.license_classes`) are **deprecated in place** with SQL comments — empty in production, preserved per ARCHIVE-not-DELETE policy for archaeology. Driver FK wiring to these reference tables is deferred to block **A17.1-DRIVER-FK-WIRE**.

Frontend pages reuse `DriversReferenceCatalogPage` with Code / Label / Sort Order / Archived columns, search, archive filter, and **+ Create** modal. Pay catalogs remain on `/lists/driver/*` (singular). **CI:** `verify:drivers-reference-catalogs-wired` asserts each page references real `reference.*` endpoints and contains no stub strings.

## END OF ARCHITECTURAL DESIGN

This document is the canonical reference. When in doubt about what a screen contains or what a button does, **this document wins**. Changes to scope require Jorge's explicit approval and an entry in the unified blueprint additions file.
