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
| **Left sidebar** | 15 module icons + labels: HOME · MAINT · ACCTG · BANK · FUEL · SAFETY · DRIVERS · CUSTOMERS · DISPATCH · VENDORS · DOCS · LISTS · REPORTS · 425C · DRV APP | Yes (collapsed icons on narrow viewport) |
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

### Sub-nav tabs (8 total — UPDATED with locked design)

| Tab | What it shows | Notes |
|-----|---------------|-------|
| **Active WOs** | All open + in-progress WOs in table view | Default view |
| **R&M Status Board** | Kanban: Open / Awaiting Parts / In Progress / Awaiting Vendor / Completed | Drag-to-transition |
| **Arriving Soon Needs Service** ← NEW T11.6.2 | Cards of units arriving at yard with open in-transit issues + ETA | Phase 3 ships UI; Phase 4 wires live Samsara ETA |
| **In-Transit Issues** | Triage queue from `dispatch.intransit_issues` (driver-reported failures) | "Promote to WO" action per WF-049 |
| **Damage Reports** | Pre-WO damage photo intake | Auto-spawn WO-AC if accident |
| **PM Schedule** | Per-unit PM-due forecast (next 30/60/90 days) | Read API per WF-044 |
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

### Sub-nav tabs (7 — locked design)

| Tab | What it shows | Phase |
|-----|---------------|-------|
| **Active Routes** | Current driver routes with fuel stop plan | Phase 3 ✅ |
| **Loves Upload** | Excel upload from Loves portal · auto-categorize transactions | Phase 3 ✅ |
| **Compliance Tracker** | Drivers with fuel/HOS compliance issues | Phase 3 ✅ |
| **Savings Tracker** | Estimated savings from optimal stops vs actual | Phase 3 ✅ |
| **IFTA Reports** | Per-state miles + gallons + tax | Phase 3 ✅ |
| **Avoid States Map** | States with fuel tax issues to route around | Phase 3 ✅ |
| **Settings** | Preferred fuel networks · Avoid states · HOS thresholds | Owner only |

### KPI row — 5 cards
MPG Fleet Avg · MTD Gallons · MTD Fuel Cost · IFTA Tax (Q-to-date) · Savings vs Plan (90d)

### Cross-module
- Drivers in Drivers module link to fuel transactions here
- Maintenance Integrity Report uses MPG anomaly detection from this module

---

## MODULE 6 — SAFETY ⚠️ MOST GAPS — JORGE'S CALLOUT

**Route:** `/safety`
**Approved screen:** `6-Safety.png`
**Phase 3 task:** T11.10 (shipped at `d24d926` — INCOMPLETE per Jorge audit)
**Pending:** T11.10.1 — add missing Fines / Company Violations / Integrity Alerts tabs
**Purpose:** All compliance + driver safety + accident handling + violations + integrity alerts

### Top action button
**+ Log Safety Event**

### Sub-nav tabs (15 — V5 locked order)

| Tab | What it shows | Status | Phase |
|-----|---------------|--------|-------|
| **Events** | All driver safety events table | ✅ shipped | Phase 3 |
| **Training** | Driver training records + certifications + expiry | ✅ shipped | Phase 3 |
| **Drug/Alcohol** | D/A test schedule + results + chain of custody | ✅ shipped | Phase 3 |
| **Accident Reports** | Accident records with AccidentReportDrawer (photos · spawn WO · spawn liability) | ✅ shipped | Phase 3 |
| **CSA Score** | FMCSA SAFER cached score + BASIC breakdown | ✅ shipped (cached only — live in Phase 6) |
| **HOS Violations** | Driver HOS violation log + escalation | ✅ shipped | Phase 3 |
| **Vehicle Inspections** | DVIR records + roadside inspections + OOS tracking | ✅ shipped | Phase 3 |
| **DOT Inspections** | DOT inspection log with OOS auto-spawn WO flow | ✅ shipped in P3-T11.17 |
| **Civil Fines** | Driver/company civil fines log · convert to liability via WF-035 | ✅ shipped in P3-T11.17 |
| **Internal Fines** | Office-imposed policy fines with approved→liability conversion | ✅ shipped in P3-T11.17 |
| **Company Violations** | DOT/FMCSA company-level violations · CSA improvement plans · audit prep | ✅ shipped in P3-T11.17 |
| **Complaints** | HR/safety complaints workflow with role-restricted access | ✅ shipped in P3-T11.17 |
| **Liabilities** (cross-link) | Read-only view of `driver_liabilities` filtered to safety-source records | ✅ shipped |
| **Integrity Alerts** | Theft/collusion anomaly detection (per-unit, per-driver, per-vendor, fleet baselines) | ✅ shipped |
| **Settings** | CSA targets · Training intervals · Violation thresholds | Owner only |

### KPI row — 6 cards (UPDATED)
Open Events · Pending Acks · MTD Violations · Training Due (30d) · Open Fines · CSA Score

### NEW: Fines tab detail
- Table: Date · Driver · Type (DOT / Permit / Toll / Speeding / Equipment / Other) · Amount · Status (Open / Paid / Disputed / Forwarded to Liability) · Source (Roadside / Office / Court Notice) · Action
- Action: "Convert to Driver Liability" → creates `driver_liabilities` entry per WF-035 (Company Paid Driver Expense Recovery)
- Filter: by driver / by type / by status / by date range
- Empty state: "No fines on record."

### NEW: Company Violations tab detail
- Table: Date · Violation Code · Severity (1-10) · Description · BASIC Category (Unsafe Driving / Crash Indicator / HOS / Vehicle Maintenance / Controlled Substances / HazMat / Driver Fitness) · Status · Action
- Action: "Create Improvement Plan" → opens task list with assigned owner + due date
- Linked to: company-level CSA score history
- Audit prep export: PDF for FMCSA audit

### NEW: Integrity Alerts tab detail (when T11.6.1 ships)
- 4 panels: By Unit · By Driver · By Vendor · Fleet Baselines
- Each panel: table of entities flagged + threshold breach + last event date
- Detection categories (Phase 6 alert engine):
  1. Tire frequency anomaly (per unit)
  2. Repair frequency anomaly (per unit)
  3. Unit cost anomaly
  4. Accident frequency (per unit)
  5. Driver incident/accident count
  6. Driver repair frequency (cross-unit)
  7. Driver fuel consumption (MPG anomaly)
  8. Driver tire change frequency
  9. Vendor cost anomaly (price gouging)
  10. Vendor invoice frequency
  11. Vendor-driver collusion pattern

### AccidentReportDrawer (right slide-in, already shipped — to be enhanced)
- Accident summary + status (under-investigation / closed-no-fault / closed-driver-at-fault)
- Photo upload (R2)
- "Spawn Liability" button → creates `driver_liabilities` row
- "Spawn WO" button → creates `maintenance.work_orders` with source_type='AC' (when T11.6.1 merges)
- "Send Ack Request" → WhatsApp/SMS/Email (WF-036 office side)

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

---

## END OF ARCHITECTURAL DESIGN

This document is the canonical reference. When in doubt about what a screen contains or what a button does, **this document wins**. Changes to scope require Jorge's explicit approval and an entry in the unified blueprint additions file.
