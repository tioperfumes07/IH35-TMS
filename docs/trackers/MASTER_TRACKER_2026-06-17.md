# IH35-TMS — MASTER TRACKER (reconciled vs LIVE) — 2026-06-17

> Generated 2026-06-17 13:45 CST by read-only repo + GitHub reconciliation (branch-merge match against 400 most-recent merged PRs).
> Supersedes `MASTER_PROGRESS_REPORT.md` v28 (2026-06-13) and `PENDING-INVENTORY-2026-06-15.md` for current done/pending state.
> Prod live build at generation: `596e85c`. Method: each `.block-ready/*.json` construction instruction is marked DONE when its recorded `branch` matches a merged PR; otherwise PENDING.

## 0) HEADLINE

| metric | count |
|---|---|
| Written construction blocks total (`.block-ready/`) | **294** |
| Shipped (branch merged to main) | **224** |
| **PENDING (no merged branch)** | **70** |
| PRs merged in last 48h | **80** |

Of the 70 pending blocks: **~10 are Tier-1** (financial/migration — STOP + your OK), the rest Tier-3 (ship-on-green). Plus non-block backlog (PARTIAL crons, Wave-5 hardening, future Phases 6/7/8) in §4.

---
## 0b) CODE RECONCILIATION — 2026-06-17 ~21:00 CST (appended, not a rewrite)

> Method: direct code inspection of 30 of the structured `GAP-*` blocks — a GAP is **DONE-by-inspection**
> only when its backend route is registered in `apps/backend/src/index.ts` AND its frontend page is routed
> in `manifest.tsx` (or component mounted). **DONE-by-inspection ≠ live-tested.** The GAP-39 discovery
> below proves the difference: its route file looked complete but was never registered, so it was *dead*
> on the live server. Every "DONE-by-inspection" item still needs a GUARD live-check before it is trusted.
> Original block entries above are unchanged (per docs/CLAUDE.md §12 — append, don't erase).

**Verified result of 30 audited: 25 DONE-by-inspection · 4 PARTIAL · 1 was-unregistered (now wired).**

### DONE (code-verified by inspection, NOT live-tested) — 25
GAP-8, GAP-18, GAP-19, GAP-28, GAP-29, GAP-40, GAP-44, GAP-48, GAP-49, GAP-61, GAP-62, GAP-63, GAP-66,
GAP-67, GAP-68, GAP-69, GAP-70, GAP-76, GAP-82, GAP-83, GAP-84, GAP-85, GAP-86, GAP-89, GAP-92.
Each has a registered backend route + a routed/mounted frontend surface. **Pending GUARD live spot-check**
to confirm inspection matched reality.

### PARTIAL — RE-VERIFIED: 3 of the 4 were undercounts; they're actually BUILT
- **GAP-24** Samsara freshness pill — **DONE.** `components/dispatch/FreshnessIndicator.tsx` implements
  L1–L4 + green/amber/red + age formatting and is **mounted** (LiveEtaColumns).
- **GAP-34** driver-PWA dispatch view — **DONE.** `apps/driver-pwa/src/screens/DispatchView.tsx` +
  `components/dispatch/{PickupCard,DeliveryCard,DocUploadDrawer}.tsx` all exist (pickup/delivery cards +
  doc upload). The "UI missing" verdict was wrong.
- **GAP-23** Samsara cache tiers — **DONE.** All four exist: `cache/{tier1-realtime,tier2-30s,tier3-5min,
  tier4-15min}.ts`. The warmer warming only tiers 3–4 is **by design** (real-time/30s tiers are fetched
  on-demand, not pre-warmed) — not a gap.
- **GAP-38** damage continuity + insurance auto-claim — **genuinely incomplete:** routes built but **NOT
  registered**; **TIER-1** (its `auto-create-claim` writes `insurance.claim` = financial/legal). Needs a
  Tier-1 review (idempotency / threshold / policy-link / RLS) + Jorge's OK before wiring.

> **CONCLUSION (GAP layer):** of 30 GAPs audited, the ONLY genuinely-unfinished items are: GAP-38 (Tier-1
> review), GAP-39 (now wired, #1157), GAP-10 (built, #1156), GAP-11 (blocked on #1152). Three of four
> "PARTIAL" verdicts were undercounts. BUT see the DEPTH correction below — "route+page exist" is NOT the
> right bar for the big domain modules.

## 0c) DEPTH CORRECTION — 2026-06-17 ~21:35 CST (GUARD live-loaded the financial/ops domains)

> The 0b "DONE-by-inspection" standard ("backend route registered + frontend routed") **over-counts** for
> the big domain pages: a STUB page is still routed and still renders, so inspection wrongly called it DONE.
> GUARD live-loaded each domain and judged DEPTH (does the page do what the mockup shows). Re-classified
> with three honest buckets — **STUB** (placeholder, empty even with data → needs build), **BUILT-BUT-EMPTY**
> (real module, renders thin only because no data/not-seeded → needs data, not rebuild), **BUILT+POPULATED**.

- **FINANCE HUB (`/finance`) — STUB / NOT BUILT (correctly).** `FinanceOverviewPage`, `FinanceProjectionsPage`,
  `FinanceScenariosPage` are 8–19-line placeholder pages ("Future module for financial planning"). Calculator
  (114L) + Amortization (139L) are client-side calculators (no persistence); LoanWizard (199L) is partial.
  This is the **gated Finance Hub** designed in FH-1…FH-8 (Fixed Assets/Depreciation, Loan Wizard, Amortization
  Engine, Calculator, Bankruptcy Modeler, Tax Manager, Unit Allocation, Lease Contracts) — **design-docs only,
  no build**. Build size = **LARGE** (8 sub-modules; ~2 partially real). **Tier-1 gated finance build**
  (never self-merge; design-first; Jorge OK). My 0b audit did NOT list /finance — but this corrects any
  impression that the domain is done.
- **MAINTENANCE (`/maintenance`) — BUILT (code), THIN LIVE = data/empty-state (NOT a stub).** The routed
  `MaintenanceHomePage` is a 470-line dashboard: registered KPI / R&M-status / triage / recent / work-orders
  endpoints (`registerMaintenanceDashboardKpisRoutes` etc.), tabs, `WorkOrdersTable`, `CreateWorkOrderModal` —
  structurally matches `2-Maintenance.png` (KPI cards + WO table). GUARD saw it thin live → root cause is
  **empty TRANSP data / KPI cards vanishing on empty / no-company-selected**, not a missing module.
  Action: live data+endpoint check; fix empty-state so KPI cards render "0" instead of disappearing.
- **INVENTORY (`/inventory` → `InventoryPartsStockPage`) — BUILT-BUT-EMPTY.** Real parts-stock query + tabs +
  create drawer (102L); renders near-empty because no parts data. Not a stub.
- **CUSTOMERS QBO sync — BUILT, never run.** `CustomersSyncPanel` "Sync now" button → `POST
  /api/v1/qbo-sync/customers/pull-now` (+ reconcile). "Synced 0 of 1209, never" = **the button has never
  been clicked**; it's a manual pull, not a cron and not broken. Same "built, not seeded" pattern as Samsara
  HOS, but the trigger is a visible button. Jorge: click "Sync now" (or decide to schedule it).

> **CORRECTED STANDARD:** code-inspection can only separate **STUB** from **BUILT**; it CANNOT separate
> BUILT-BUT-EMPTY from BUILT-AND-WORKING — only GUARD's live load + real data can. So: STUB (Finance Hub)
> = genuine build work; BUILT-BUT-EMPTY (Maintenance / Inventory / Customers) = data/seed/empty-state +
> a live check, NOT a rebuild. The "70 PENDING" remains mostly stale, but the honest remaining *build* is
> the **Finance Hub** (large, gated) + empty-state polish + the GAP-38 Tier-1 review. A stub marked DONE is
> the exact trust failure being guarded against — this section corrects it.

### Was unregistered → now wired
- **GAP-39** geofence state machine — route file was complete but `registerGeofenceStateMachineRoutes`
  was never called in index.ts (all 3 endpoints 404'd live). Wired in **PR #1157** (+ fixed an always-403
  lowercase `"owner"` gate). Held for merge; GUARD live-verify after.

### Built this session (held for merge)
- **GAP-10** cancellations report — **PR #1156** (held). **GAP-11** upload-expense — **blocked** on the
  orphaned-attachment fix **PR #1152** (held); do not build on the broken draft-id pattern.

### Takeaway
The true *remaining* GAP build work is roughly **GAP-34 / GAP-24 / GAP-23** (+ the GAP-38 Tier-1 review and
merges of #1152 / #1156 / #1157) — on the order of **~6–8 items, not 70**. The headline "70 PENDING" reflects
`.block-ready` branch-name matching, which misses work that merged under a different branch or sits built but
unregistered. **Caveat: the 25 DONE-by-inspection are unconfirmed until GUARD live-checks a sample.**

---
## 1) WORK DONE — last 48h (80 PRs merged)

- #1052 docs(fleet): FLEET-ASSET-HOME — Units module gap audit + gated proposal
- #1053 feat(samsara): real-trailer sync /fleet/trailers → mdata.equipment (E2)
- #1054 fix(fleet): hide demo/phantom (SAM-*/TEST/DEMO) from fleet dropdowns + roster (E1)
- #1055 feat(units): block Sold/Transferred when unit has an open work order (WF-064, Block B)
- #1056 feat(fleet): top-level FLEET nav + /fleet home (Units roster) — C1+C2
- #1057 docs(cash-flow): Manual Daily Prediction tab spec (Block F, firewalled)
- #1058 fix(samsara): savepoint-isolate syncs so VIN collision can't skip trailers
- #1059 feat(forecast): firewalled Manual Daily Projections tab (Block F) — GATED at migration
- #1060 feat(forms): shared QuickBooks DatePicker / TimePicker / MoneyInput (Block P)
- #1061 fix(tasks): grant ih35_app on tasks schema — Task Board 500 (bug #17) — GATED
- #1062 fix(dispatch): book load accepts real company units (invalid_unit_for_company, G) — GATED
- #1063 feat(driver-hub): surface Driver Scheduler + Leave Requests (Block J)
- #1064 fix(dispatch): load board auto-fit, no horizontal scroll (Block L)
- #1065 feat(forecast): enable CASH_FORECAST_ENABLED flag (Block F go-live)
- #1066 feat(dispatch): Load Wizard V5 compact density (Block H, incr 1) behind flag
- #1067 feat(forecast): QB DatePicker + MoneyInput on Manual Daily Projections (Block N)
- #1068 feat(accounting): PayBillModal QB DatePicker + MoneyInput (Block N) — GATED-LIGHT
- #1069 fix(fleet): Edit Vehicle/Trailer Save actually saves (BUG-FLEET-EDIT-SAVE)
- #1070 feat(forecast): Manual Daily Projections mirrors Projected (Auto) (queue #1)
- #1071 feat(forms): shared StateSelect + Load Wizard stop wiring (queue #2)
- #1072 fix(accounting): cash-forecast opening excludes credit accounts (CASH-ANOMALY #10)
- #1073 fix(dispatch): booking driver dropdown shows real names (queue #9)
- #1074 feat(drivers): driver profile QB density (queue #6)
- #1075 feat(fleet): QB DatePicker on fleet edit date fields (queue #5)
- #1076 feat(ui): QB DatePicker on named surfaces — Tasks/Customers/Vendors/Drivers (queue #5)
- #1077 feat(ui): Active/Inactive list filter — Customers + Vendors (queue #3 SOFT-DELETE)
- #1078 feat(ui): Inactivate/Reactivate on Customer + Vendor profiles (queue #3 SOFT-DELETE)
- #1079 feat(ui): QB DatePicker on Safety surfaces (queue #5)
- #1080 feat(ui): QB DatePicker on operational surfaces — dispatch/maint/planner/insurance/docs (queue #5)
- #1081 feat(ui): QB DatePicker on Reports filters (queue #5)
- #1082 feat(ui): QB DatePicker on accounting/banking list filters (queue #5)
- #1083 feat(ui): QB DatePicker on remaining non-financial surfaces (queue #5)
- #1084 fix(cash-flow): Manual Daily Projections summing bug — integer-cents (MANUAL-PROJECTIONS-V2 Part A)
- #1085 feat(ui): QB form density — driver profile show-first (DENSITY-SWEEP-QB)
- #1086 feat(table): shared GLOBAL-TABLE-CONTROLS toolbar + Fleet (show-first)
- #1087 fix(nav): sidebar FACT → /factoring (stop Accounting subnav bleed)
- #1088 fix(cash-flow): exclude credit accounts from auto opening cash (CASH-ANOMALY −$5.5M)
- #1089 feat(ui): standardize oversized form inputs to QuickBooks density (DENSITY-SWEEP-QB)
- #1090 feat(fleet): include_inactive param (view/reactivate soft-deleted units) — HELD for Jorge
- #1091 feat(fleet): Active/Inactive/All filter + bulk Reactivate (soft-delete)
- #1092 feat(table): global column sort + resize in shared TableControls (Fleet first)
- #1093 feat(home): global clickable KPIs (drill-down)
- #1094 feat(ui): QB DatePicker on Insurance create wizards (CALENDAR finish)
- #1095 docs(tracker): 2026-06-17 session update
- #1096 feat(forecast): Part B snapshot ref columns (MANUAL-PROJECTIONS-V2) — HELD for Jorge
- #1097 feat(home): clickable KPIs on Owner dashboard
- #1098 feat(insurance): Down Payment field on Create-Policy wizard
- #1099 feat(forms): DatePicker max/min + Safety calendar conversions
- #1100 feat(customers,vendors): adopt shared GLOBAL-TABLE-CONTROLS (sort/resize/paging/search/gear)
- #1101 feat(reports): RunnerTable adopts shared TableHeaderCell + useTablePref
- #1102 feat(home): clickable dispatcher KPIs → loads board
- #1103 guard(insurance): lock policy_unit has no is_active (removed_at)
- #1104 fix(insurance): /api/v1/insurance/summary aggregate (dashboard widgets 404)
- #1105 feat(dispatch): Part A — filter→slim QuickBooks toolbar + Date double-outline fix
- #1106 Dispatch Part B/C — unified column model + 3-section List/Table grid (show-first)
- #1107 Dispatch Part D — Kanban 10 lanes + ~40px compact cards + Fleet-OOS strip (show-first)
- #1108 [DO NOT MERGE pending OK] ETA-MODEL BLOCK 1 — two-date load model (migration + design)
- #1109 [needs OK to merge — backend] Wire dispatch HOS columns to in-app HOS store (no Samsara)
- #1110 [DESIGN — do not merge] BLOCK 2 PROJECTED-CASH-FOLLOWS-ETA design
- #1111 [dry-run only — needs authorization to commit] AW open-loads import (11 loads, TRANSP)
- #1112 [needs OK — backend read path] ETA-MODEL BLOCK 1 consumer wiring (effective_delivery_date)
- #1113 [DO NOT MERGE pending OK — financial migration] BLOCK 2 foundation — predicted-delivery audit + receivable-lag
- #1114 fix(dispatch): correct Awaiting/Booked partition (GUARD live-verify fix)
- #1115 MDP single-row redesign — one date + horizontal income/expense rows (show-first)
- #1116 Feat/cash eta confirm endpoint
- #1117 Feat/cash eta forecast rebucket
- #1118 fix(dispatch): compress List/Table rows + rename 3rd section to In shop (defects #3/#4)
- #1119 fix(dispatch): wire Live GPS to real last-known position (defect #2)
- #1120 fix(dispatch): truck-centric Awaiting assignment (roster minus loaded trucks)
- #1121 fix(dispatch): wire Live GPS to real position (defect #2, re-PR — #1119 didn't land in main)
- #1122 fix(dispatch): Kanban lane-1 Awaiting assignment = truck-derived
- #1123 fix(dispatch): populate Driver + HOS for awaiting (unloaded) trucks
- #1124 feat(forecast): BLOCK 2 — re-bucket 7-day strip + Actual-vs-Projected by projected_cash_date
- #1125 hotfix(dispatch): currency formatter crash on no-load Awaiting rows — board DOWN
- #1126 hotfix(dispatch): harden SettlementProfitabilityCard currency formatter (audit follow-up)
- #1127 fix(dispatch): Awaiting = active trucks only + dedupe Booked (GUARD re-verify #2/#3)
- #1128 hotfix(fleet): bulk inactivate isolates failures + never hangs (STOP-THE-LINE)
- #1129 fix(mdata): set tenant RLS context before equipment/units soft-delete (inactivate 500)
- #1130 diag(mdata): runtime RLS probe + exact PG error on equipment/units deactivate 42501
- #1131 fix(mdata): drop RETURNING from equipment/units deactivate — RLS 42501 on soft-delete

**Shipped block-set total: 224 construction blocks merged** (full ID list in Appendix A). Earlier phases (0–5 foundation, Safety v6.4, QBO master-data bidi sync, dispatch core, accounting backbone A/B) are DONE per v28 recon; see `MASTER_PROGRESS_REPORT.md` for the full historical ledger.

---
## 2) PENDING WRITTEN BLOCKS — construction instructions (verbatim `task`)

These are the agent-written blocks whose recorded branch is NOT merged. Grouped by phase. Each shows the **written construction instruction**, classification, branch, and merge gate.

> ⚠️ **Gate caveat:** "Tier-3 — ship on green" applies only to pure-frontend/docs blocks. Any block with **db:True** (backend route or migration) still hits the §1.3 backend gate → STOP + Jorge's OK before merge, even when class is non-financial. "ship on green" here means CI-green-and-ready, not self-merge-authorized.

### Phase / group: GAP-HIGH  (31)

#### `BLOCK5-INSURANCE-FORWARD-FIX`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/insurance-bill-creator-forward-fix`
- **INSTRUCTION:** Forward-fix for the #687 double-bill vulnerability: require Idempotency-Key on /insurance/policies, partial-UNIQUE bill_uuid, replay-skip pre-check, atomic hard-fail+rollback with bill void / CRITICAL Sentry on orphans, and bill the down payment so down + sum(installments) === total_premium. Additive-only; keeps bill_uuid + vendor_id from #687.

#### `GAP-10-DELTA-CANCELLATIONS-REPORT`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-10-delta-cancellations-report`
- **INSTRUCTION:** Load cancellations analytics report (group by reason, driver, customer, date)

#### `GAP-11-DELTA-UPLOAD-EXPENSE`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-11-delta-upload-expense`
- **INSTRUCTION:** Wire UploadZone into expense create form (match bill/invoice attachment pattern)

#### `GAP-19-DETENTION-INVOICE`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-19-detention-invoice`
- **INSTRUCTION:** GAP-19 Detention billable manager-approval gate — approve bridges detention into linehaul invoice (reuses bridgeDetentionToBilling + buildInvoiceFromLoad) and records dwell evidence (stop-timestamp derived + units→Samsara projection join).

#### `GAP-34`
- **gate:** Tier-3 — ship on green  ·  **class:** OVERLAP  ·  **db:** True  ·  **branch:** `feature/gap-34-driver-pwa-dispatch-view`
- **INSTRUCTION:** G22 Driver PWA dispatch view (pickup/delivery cards + doc upload)

#### `GAP-38-DAMAGE-INSURANCE-CONTINUITY`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-38-damage-continuity`
- **INSTRUCTION:** Damage report continuity chain + WF-027 insurance auto-claim linkage (additive; UI on locked shared surface deferred for preview)

#### `GAP-39`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-39-geofence-state-machine`
- **INSTRUCTION:** G17 Geofencing full backend state machine

#### `GAP-40`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-40`
- **INSTRUCTION:** Damage photo EXIF chain-of-custody (WF-058)

#### `GAP-44`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feature/gap-44-form-425c-exhibits`
- **INSTRUCTION:** Form 425C Exhibits A-F auto-build for TRANSP monthly DIP filings

#### `GAP-48`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feature/gap-48-driver-operations-depth`
- **INSTRUCTION:** GAP-48 Driver Operations Depth — 12 read-only operational sub-views on a new Operations tab

#### `GAP-49`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-49-dvir-severity-tagging`
- **INSTRUCTION:** Maintenance Pre-Flight DVIR Severity Tagging (major vs minor vs observation) — WF-050 / 49 CFR §396.11

#### `GAP-61`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-61`
- **INSTRUCTION:** CAP-11 Fuel card real-time fraud alerts

#### `GAP-62-CAP-12-TIRE-TREAD`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-62`
- **INSTRUCTION:** CAP-12 tire tread wear tracking and replacement projections

#### `GAP-63`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-63`
- **INSTRUCTION:** CAP-13 Brake Wear Predictive Maintenance — lining thickness tracking + replacement projections

#### `GAP-67-ACCOUNTING-HOME`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-67-accounting-home`
- **INSTRUCTION:** Accounting Home role-specific view (read-only display)

#### `GAP-68-SAFETY-OFFICER-HOME`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-68-safety-home`
- **INSTRUCTION:** Safety Officer home role-specific view

#### `GAP-69-DRIVER-MANAGER-HOME`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-69-driver-manager-home`
- **INSTRUCTION:** Driver Manager home role-specific view

#### `GAP-70`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-70`
- **INSTRUCTION:** EDI Integration Foundation (204/214/210/990)

#### `GAP-76`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-76-deadhead-optimizer`
- **INSTRUCTION:** Deadhead mile optimizer — ranked next-load suggestions

#### `GAP-76`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-76-deadhead-optimizer`
- **INSTRUCTION:** Deadhead mile optimizer — ranked next-load suggestions

#### `GAP-8`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-8-assignments-quicksave`
- **INSTRUCTION:** G26 assignments inline quicksave (unit/trailer/driver)

#### `GAP-82-MEDICAL-CARD-TRACKING`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-82-medical-card`
- **INSTRUCTION:** Medical card + CDL expiry tracking and alerts

#### `GAP-83-ELD-AUDIT-VIEWER`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-83-eld-audit`
- **INSTRUCTION:** ELD audit trail read-only viewer

#### `GAP-84-DOT-INSPECTION-GAP-CLOSE`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-84-dot-inspection-gap-close`
- **INSTRUCTION:** DOT inspection clean-rate endpoint, score badge, and CI verify guard

#### `GAP-85-PERMIT-TOLL-TRACKING`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-85-permit-toll`
- **INSTRUCTION:** Permit + toll tag tracking per unit with expiry alerts

#### `GAP-86-INSURANCE-BILL-CREATOR`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-86-insurance-bill-creator`
- **INSTRUCTION:** Insurance multi-vehicle policy creator + bill schedule write via createBill()

#### `GAP-89-UNIVERSAL-SEARCH-CMD-K`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-89-universal-search`
- **INSTRUCTION:** Universal Cmd-K quick switcher search

#### `GAP-89-UNIVERSAL-SEARCH-CMD-K`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-89-universal-search`
- **INSTRUCTION:** Universal Cmd-K quick switcher search

#### `GAP-91-MOBILE-RESPONSIVE-AUDIT`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-91-mobile-responsive-audit`
- **INSTRUCTION:** Mobile responsive audit + PWA touch UI polish

#### `GAP-91-MOBILE-RESPONSIVE-AUDIT`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-91-mobile-responsive-audit`
- **INSTRUCTION:** Mobile responsive audit + PWA touch UI polish

#### `GAP-92-FEATURE-FLAG-SYSTEM`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-92-feature-flags`
- **INSTRUCTION:** Per-tenant and per-user feature flag system

### Phase / group: (unfiled)  (10)

#### `?`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** 

#### `?`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** 

#### `?`
- **gate:** TIER-1 — migration; STOP + Jorge OK  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **migration:** `202606080030_audit_trigger_drift_remediation.sql`
- **INSTRUCTION:** 

#### `?`
- **gate:** TIER-1 — migration; STOP + Jorge OK  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **migration:** `none`
- **INSTRUCTION:** 

#### `?`
- **gate:** Tier-3 — ship on green  ·  **class:** A  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** 

#### `?`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** 

#### `?`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/sidebar-driver-hub`
- **INSTRUCTION:** 

#### `BK7-INLINE-CREATE-DRAWERS`
- **gate:** Tier-3 — ship on green  ·  **class:** MIXED  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** 

#### `GAP-18-DRIVER-COMM-TIMELINE`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-18-driver-comm-log`
- **spec:** `docs/dispatch/batches/GAP-18-DRIVER-COMMUNICATION-LOG-MODULE-GO.md`
- **INSTRUCTION:** 

#### `GAP-7`
- **gate:** Tier-3 — ship on green  ·  **class:** OVERLAP  ·  **db:** False  ·  **branch:** `feature/gap-7-severe-repair-oos`
- **spec:** `docs/dispatch/batches/GAP-7-G20-SEVERE-REPAIR-OOS-ESTIMATE-GO.md`
- **INSTRUCTION:** 
- **details:** ['severe-repair-estimate.service/routes and SevereRepairOosTab rollup already exist — extend with fleet-restore-cost, per-unit-breakdown, PDF export, Owner home card.', 'GAP-6 dependency met: duration_minutes present in migration 0158_abandonment_and_wo_time_tracking.sql.']

### Phase / group: GAP-MEDIUM  (7)

#### `GAP-23`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feature/gap-23-samsara-cache-tiers`
- **spec:** `docs/dispatch/batches/GAP-23-4-TIER-SAMSARA-CACHE-HIERARCHY-GO.md`
- **INSTRUCTION:** 4-tier Samsara cache hierarchy with scheduled warmer
- **details:** ['ADDITIVE backend-only: 4-tier Samsara cache hierarchy with in-memory + optional Redis tier2.', 'No existing cache-tiers module on main — dedupe clean.', 'Cache warmer wired via initializeSamsaraCacheWarmer in index.ts.', 'Legacy SamsaraClient consumers grandfathered in verify:cache-tier-coverage until GAP-24.']

#### `GAP-24-FRESHNESS-INDICATOR`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feature/gap-24-freshness-indicator`
- **spec:** `docs/dispatch/batches/GAP-24-PER-SCREEN-SAMSARA-FRESHNESS-BUDGET-GO.md`
- **INSTRUCTION:** Samsara freshness indicator pill (L1-L4, green/amber/red)
- **details:** ['ADDITIVE frontend-only: reusable FreshnessIndicator pill for dispatch table columns.', 'Props: lastFetchedAt (ISO string|null), cacheTier (1|2|3|4|null).', 'Color: green <30s L1/L2, amber 30s-2min or L3, red >2min or L4/unknown.', 'Usage example shipped for Block 3 ETA column wiring; DispatchBoard.tsx not edited.']

#### `GAP-28`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-28-layover-detection`
- **INSTRUCTION:** Layover Time Computation (>8h Gap)

#### `GAP-29`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feature/gap-29-booking-gap-analytics`
- **INSTRUCTION:** Booking-Gap Time per Dispatcher Analytics

#### `GAP-30`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `feature/gap-30-late-arrival-analytics`
- **INSTRUCTION:** Late-arrival rate analytics per driver/customer/lane

#### `GAP-41`
- **gate:** Tier-3 — ship on green  ·  **class:** OVERLAP  ·  **db:** False  ·  **branch:** `feature/gap-41`
- **INSTRUCTION:** 9 Reports Hub categories with hover-dropdown WF-061

#### `GAP-50`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/gap-50`
- **INSTRUCTION:** AI Photo Comparison Pre/Post Trip Damage Detection

### Phase / group: Accounting  (3)

#### `C6-HOME-DASHBOARD`
- **gate:** TIER-1 — STOP, show SQL, Jorge OK (no self-merge)  ·  **class:** NON-FINANCIAL  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** QBO-style home dashboard at /app/homepage. Read-only aggregation. Sidebar HOME item wired to /app/homepage. No financial writes.

#### `C7-ACCT-SUBNAV-CHROME`
- **gate:** TIER-1 — STOP, show SQL, Jorge OK (no self-merge)  ·  **class:** NON-FINANCIAL  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** Accounting sub-nav 12 QBO items (exact live order) + global topbar + Create and Tasks buttons. Shell pages for missing routes. Additive only. No posting, no financial writes.

#### `ITEM1-TWO-SIDED-ITEM`
- **gate:** TIER-1 — STOP, show SQL, Jorge OK (no self-merge)  ·  **class:** NON-FINANCIAL  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** Two-sided item model: sell side (income account, defaults to Service income) + buy side (expense account + preferred vendor). ItemEditorModal replaces generic metadata modal. No financial writes.

### Phase / group: HOTFIX  (3)

#### `BLOCK-C-MIGRATION-RENAME`
- **gate:** TIER-1 — migration; STOP + Jorge OK  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `fix/block-c-migration-rename`
- **migration:** `db/migrations/202606071910_settlement_min_net_floor.sql`
- **INSTRUCTION:** Rename Block C migration to 12-digit runner-compatible filename so db:migrate applies min_net_settlement columns in prod.

#### `FIX-SAFETY-NAV-COUNT`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `fix/safety-nav-count-import`
- **INSTRUCTION:** Restore SAFETY_CANONICAL_TAB_COUNT reference in HomePage after home router refactor

#### `HOTFIX-0327-MIGRATION-ROLE`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `hotfix/0327-drug-alcohol-app-user`
- **INSTRUCTION:** Fix migration 0327 GRANT role (app_user → ih35_app) + TS18048 guards (GAP-81)

### Phase / group: STRUCTURAL-FIX  (2)

#### `STRUCTURAL-MANIFEST-SPLIT`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feat/manifest-per-block`
- **INSTRUCTION:** Each block writes its own .block-ready/<block-id>.json; zero manifest merge conflicts in parallel lanes

#### `STRUCTURAL-MIGRATION-TIMESTAMPS`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feat/migration-timestamp-naming`
- **INSTRUCTION:** New migrations use timestamp format (20260607_120000_name.sql) to eliminate parallel-lane sequence collisions

### Phase / group: Accounting — QBO Parity  (1)

#### `ACCT-QBOPAR-01-CATALOG-BACKEND`
- **gate:** TIER-1 — migration; STOP + Jorge OK  ·  **class:** —  ·  **db:** True  ·  **branch:** `—`
- **migration:** `202606080010_account_type_detail_type_catalog.sql`
- **spec:** `docs/specs/ACCOUNT-TYPE-DETAIL-TYPE-CATALOG.md`
- **INSTRUCTION:** QBO-parity account type & detail type catalog: migration + seed (15 types / 5 groups) + GET /api/v1/accounting/account-type-catalog route.

### Phase / group: BLOCK  (1)

#### `BLOCK7-DRIVER-HUB-REQUESTS`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feature/block7-driver-hub-requests`
- **INSTRUCTION:** Driver Hub Requests — Manager/Owner approve/deny cash advance requests; approve creates a settlement deduction via createSettlementDeduction()

### Phase / group: BLOCK-C  (1)

#### `BLOCK-C-DEDUCTION-CAP`
- **gate:** TIER-1 — migration; STOP + Jorge OK  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/block-c-deduction-cap`
- **migration:** `db/migrations/20260607_191000_settlement_min_net_floor.sql`
- **INSTRUCTION:** Settlement deduction cap — net floor (50% gross + absolute cents) with all-or-nothing roll-over of pending deductions at settlement close.

### Phase / group: BLOCK-H  (1)

#### `BLOCK-H-DETENTION-NOTIFY`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** True  ·  **branch:** `feature/block-h-detention-notify`
- **INSTRUCTION:** Block H — On detention request approval (PATCH /api/v1/dispatch/detention/requests/:id/approve), after the billing bridge + invoice build, email the customer a detention-charge notice. Default OFF behind feature flag 'detention_customer_notify_email'; sent AFTER the approval tx commits; idempotent on dispatch.detention_requests.customer_notified_at; charge labeled 'derived from stop timestamps'.

### Phase / group: CI Infrastructure  (1)

#### `FIX-CANARY-SMOKE-DURABLE`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** Simplify smoke.sh to health-only: drop SMOKE_TEST_TOKEN/EMAIL/PASSWORD/COMPANY_ID — auth is Google OAuth/Lucia, no service-token route exists. Update prod-postdeploy-verify.yml and pr-preview-smoke.yml to not pass removed secrets. Update verify-canary-replacement.mjs to assert health-only smoke (checks 8+9).

### Phase / group: DISPATCH  (1)

#### `DISPATCH-LIVE-ETA`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feature/dispatch-live-eta-columns`
- **INSTRUCTION:** Dispatch live ETA columns — driver status, Samsara ETA, on-time prediction
- **details:** ['Additive read-only columns on DispatchList (not DispatchBoard.tsx).', 'Board data from GET /api/v1/mdata/loads?include_live_eta=true (no new route).', '60s React Query refresh via useLoadsList; no per-row ETA API calls.', 'Freshness column imports GAP-24 FreshnessIndicator.']

### Phase / group: Dispatch  (1)

#### `DISP-PLANNERS`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **INSTRUCTION:** DISP-PLANNERS

### Phase / group: Foundation  (1)

#### `W1-EVENT-LOG-SPINE`
- **gate:** TIER-1 — STOP, show SQL, Jorge OK (no self-merge)  ·  **class:** NON-FINANCIAL  ·  **db:** True  ·  **branch:** `—`
- **INSTRUCTION:** Immutable timestamped event spine — events.event_log table + logEvent() helper. All downstream Waves (2-5) write to this for accountability. NON-FINANCIAL.

### Phase / group: GAP-STRUCTURAL  (1)

#### `GAP-PREMERGE-GATES-EXPAND`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `feat/premerge-gates-expand`
- **INSTRUCTION:** Promote three post-merge feedback checks to required pre-merge CI gates (GAP-81 failure class)

### Phase / group: P2-H  (1)

#### `GAP-66-DISPATCHER-HOME`
- **gate:** Tier-3 — ship on green  ·  **class:** B  ·  **db:** True  ·  **branch:** `feature/gap-66-dispatcher-home`
- **INSTRUCTION:** Dispatcher Home role-specific view

### Phase / group: PREREQ  (1)

#### `PREREQ-B-SETTLEMENT-DEDUCTION-SVC`
- **gate:** Tier-3 — ship on green  ·  **class:** ADDITIVE  ·  **db:** False  ·  **branch:** `feat/settlement-deduction-service`
- **INSTRUCTION:** createSettlementDeduction() service — unblocks Driver Hub Requests approve→deduction (Block 7)

### Phase / group: docs  (1)

#### `FOLLOWUP-SPECS-2026-06-07`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** False  ·  **branch:** `docs/followup-block-specs`
- **INSTRUCTION:** Follow-up block specs from June 6-7 sprint: insurance renewals, deduction cap, detention notifications, CI fixes, and Driver Hub extensions.

### Phase / group: feat/cash-flow-daily-prediction  (1)

#### `?`
- **gate:** TIER-1 — migration; STOP + Jorge OK  ·  **class:** —  ·  **db:** False  ·  **branch:** `—`
- **migration:** `202606080200_cash_flow_adjustments.sql`
- **INSTRUCTION:** 

### Phase / group: implementation  (1)

#### `BLOCK-G-COI-PDF`
- **gate:** Tier-3 — ship on green  ·  **class:** —  ·  **db:** True  ·  **branch:** `—`
- **spec:** `docs/dispatch/followup/block-G-insurance-COI.txt`
- **INSTRUCTION:** Certificate of Insurance PDF — GET /api/v1/insurance/policies/:id/coi returns Puppeteer-rendered PDF; frontend Download COI button on PolicyDetail. Read-only, no schema changes, no financial writes.


---
## 3) PENDING PHASES / TASKS — non-block backlog (from reconciled inventory)

### 3a) PARTIAL — shipped but incomplete (finish the remainder)
| item | done | missing |
|---|---|---|
| Block-E Services catalog + ETA | intervals/eta-calculator | live Samsara mileage ingest **cron** |
| Block-F Reefer hours | tables/routes/UI (mig 0366) | 15-min **poller cron** |
| Block-Q DOCS upload | backend + R2 | **frontend upload UI** |
| Block-Z Driver CDL/hire CSV | internal backfill | **user import route** |
| Block-K/AL Classes | read view | **bulk-edit / write path** |
| Block-AO PM countdown | cron registered | depends on Block-E intervals |
| Block-AF Help articles | 12 articles | **~8 modules missing** |
| AI-1 period lock | snapshot lock (0218) | **closed-period LEDGER-WRITE lock** |
| AI-2 recon cron | services exist | **scheduled wrapper** |
| AI-3 daily probe | safety cron | **FINANCIAL probes** |

### 3b) Tier-1 money/security backlog (LANE B — STOP + your OK, no self-merge)
B1 COA partial-unique+guard · B2 flip EXPENSE_GL_POSTING_ENABLED (1st live post) · B3 GAP-EXPENSES Phase-3 QBO purchase sync · B4 EXPENSE-VOID-BLOCK-IF-LINKED (hard gate) · B5 void/reversal live · B6 period-close × expense postings · B7 SEC-PROD-APP-ROLE-BYPASSES-RLS (#878, biggest blast radius) · B8 recon cron + financial probes · B9 AI-4 periods init · B10 mutation audit coverage · B11 tamper-evident audit hash chain · B12 COA-ACCOUNTS-UNAUDITED (#877) · B13 bank reconcile-commit · B14 opening-balance entry (owner-only) · B15 Block-35 Chart of Accounts main.

### 3c) Finance-Hub builds (design specs exist; Tier-3 unless they post)
A2 FH-3 Amortization (FAST, reuses loan-math.ts) · A3 FH-4 Calculator · A4 FH-7 Unit Allocation · A5 FH-8 Lease Contract · A6 FH-6 Tax Manager · A7 FH-5 Bankruptcy (LARGEST, 3–5 sub-blocks) · A8 1099 Generation · A9 Relay Internal Bank · A10 Mileage model.

### 3d) Wave-5 hardening sweep (12 — companions to shipped Tier-2)
RLS cross-tenant test · audit-log mutation routes · webhook DLQ · idempotency keys (top write routes) · concurrency probe · rate-limit · CORS origin pin · SBOM · backup/DR doc · index/query tuning (top-10 slow) · long-run cron alert · worker/outbox monitor.

### 3e) Future phases (post-MVP, not in active queue)
- **Phase 6:** EDI 204/210/214 · load optimizer/lane pairing · pricing engine · recurring invoices · CSA forecasting.
- **Phase 7 mobile:** maintenance mechanic app · Driver PWA v2 (push/photo R2) · dispatcher mobile board.
- **Phase 8:** IFTA automation · Form 2290 · drug random pool · CSA intervention.
- **Stragglers:** real email provider+cron (32/33/36) · backend test infra (69) · orphan triage (70) · FMCSA verify (72) · Sunday-5/31 follow-ups (332–335) · USMCA master-data writes (deferred to July 2026).

### 3f) NEEDS-ROW (design spec exists, no build row)
GAP-EXPENSES Phase-3 (add build row) · FH-3..FH-8 build rows · Relay-Internal-Bank build row · Mileage-Model build row · **PERMISSIONS-DESIGN (no tracker row at all)**.

---
## 4) BUILD SEQUENCE

**Lane A (Tier-3, ship-on-green, smaller-fast-first):**
0. Tracker reconcile (this doc) → 1. A11 Best-Bay typo + A18 small cleanups → 2. **A2 FH-3 Amortization** (fast) → A3 FH-4 → 3. finish PARTIAL crons (Services Samsara, Reefer poller) → 4. finish PARTIAL UI (DOCS upload, Classes write-path, Help backfill) → 5. A4–A6 FH-7/FH-8/FH-6 → 6. A8 1099 → A9/A10 Relay/Mileage → 7. **A7 FH-5 Bankruptcy LAST** → Wave-5 hardening interleaved.

**Lane B (Tier-1, sequential, risk/dependency-first — STOP + your OK each):**
B1 → B2 (flip flag) → B3 → B4 (hard gate) → B5 → B6 → **B7 SEC-RLS** (design early, stage) → B8–B15.

> Governing rule: Lane A = smaller-fast-first (clears drift, surfaces real heavy work); Lane B = risk-first, never self-merge (financial cluster, §1.4).

---
## Appendix A — SHIPPED blocks (branch merged)

- `A1-AUDIT-SPINE-LINK-COLUMNS`  ←  `feat/a1-audit-spine-link-columns`
- `A2-AUDIT-EMIT-DISPATCH`  ←  `feat/a2-audit-emit-dispatch`
- `A3-AUDIT-EMIT-MAINTENANCE`  ←  `feat/a3-audit-emit-maintenance`
- `A4-AUDIT-EMIT-ACCOUNTING`  ←  `feat/a4-audit-emit-accounting`
- `A5-AUDIT-EMIT-BANKING`  ←  `feat/a5-audit-emit-banking`
- `A6-AUDIT-UNIVERSAL-VIEW`  ←  `feat/a6-audit-universal-view`
- `A7-AUDIT-PER-ENTITY-TABS`  ←  `feat/a7-audit-per-entity-tabs`
- `A8-AUDIT-REPORTS-SECTION`  ←  `feat/a8-audit-reports-section`
- `A9-AUDIT-CI-EMIT-GUARD`  ←  `feat/a9-audit-ci-emit-guard`
- `ACCT-BLOCK-10-ACCOUNT-BALANCES`  ←  `feat/acct-block-10-account-balances`
- `ACCT-BLOCK-11-PERIODS-INIT`  ←  `feat/accounting-periods-init`
- `ACCT-BLOCK-11-PERIODS-INIT`  ←  `feat/accounting-periods-init`
- `ACCT-COA-CANONICALIZATION`  ←  `feat/acct-coa-canonicalization`
- `ACCT-INTEGRITY-VERIFY-EXTEND`  ←  `feat/accounting-integrity-verify-extend`
- `ACCT-QBOPAR-00-DESIGN-LOCK`  ←  `feat/acct-qbopar-00-design-lock`
- `ACCT-QBOPAR-02`  ←  `feat/acct-qbopar-02-listview`
- `ACCT-QBOPAR-03`  ←  `feat/acct-qbopar-03-coa-list`
- `ACCT-QBOPAR-04`  ←  `feat/acct-qbopar-04-account-drawer`
- `BLOCK-05-TIER2-CIRCUIT-BREAKERS`  ←  `feat/tier05-circuit-breakers`
- `BLOCK-08-TIER2-LOAD-TEST`  ←  `feat/tier08-load-test`
- `BLOCK-09-TIER2-E2E-PATHS`  ←  `feat/tier09-e2e-paths`
- `BLOCK-10-TIER2-RLS-TEST-GATE`  ←  `feat/tier10-rls-test-gate`
- `BLOCK-13-TIER2-TUNING-CATALOG`  ←  `feat/tier13-tuning-catalog`
- `BLOCK-16-COMPLIANCE-DASHBOARD`  ←  `feature/block-16-compliance-dashboard`
- `BLOCK-D-INSURANCE-RENEWAL`  ←  `feature/block-d-insurance-renewal`
- `BLOCK-E-INSURANCE-FLEET`  ←  `feature/block-e-insurance-fleet`
- `BLOCK-F-INSURANCE-CANCELLATION`  ←  `feature/block-f-insurance-cancellation`
- `BUG-ADD-USER-INERT`  ←  `fix/BUG-ADD-USER-INERT`
- `C1-PRE-SETTLEMENTS`  ←  `feat/c1-pre-settlements`
- `C2-FACTORING-PROFILE`  ←  `feat/c2-factoring-profile`
- `C3-CUSTOMER-CONTRACT-UPLOAD`  ←  `feat/c3-customer-contract-upload`
- `C4-CUST-VEND-REBUILD-RECLASSIFY`  ←  `feat/c4-cust-vend-reclassify`
- `CHORE-MASTER-TRACKER-MD`  ←  `chore/master-tracker-md`
- `CHORE-UNVERIFIED-ROWS-RECONCILE`  ←  `chore/unverified-rows-reconcile`
- `CLOSURE-10-MAINT-PARTS-CATALOG`  ←  `feat/closure-10-parts-catalog`
- `CLOSURE-11-MAINT-SERVICES-CATALOG`  ←  `feat/closure-11-services-catalog`
- `CLOSURE-12-CYCLE5-PAYROLL-INTEGRATION`  ←  `feat/closure-12-payroll`
- `CLOSURE-13-USMCA-JULY-LAUNCH`  ←  `feat/closure-13-usmca`
- `CLOSURE-16-DEEP-AUDIT-C`  ←  `feat/closure-16-deep-audit-c`
- `CLOSURE-17-ON-HOLD-TRIAGE`  ←  `feat/closure-17-on-hold-triage`
- `CLOSURE-18-PERF-AUDIT`  ←  `feat/closure-18-perf-audit`
- `CLOSURE-19-SEC-AUDIT`  ←  `feat/closure-19-sec-audit`
- `CLOSURE-20-A11Y-AUDIT`  ←  `feat/closure-20-a11y`
- `CLOSURE-21-MONITORING-SETUP`  ←  `feat/closure-21-monitoring`
- `CLOSURE-23-DR-BACKUP-AUDIT`  ←  `feat/closure-23-dr-backup`
- `CLOSURE-24-OPERATOR-ONBOARDING`  ←  `feat/closure-24-onboarding`
- `CLOSURE-25-RUNBOOKS`  ←  `feat/closure-25-runbooks`
- `D1-SETTLEMENTS-APPROVAL-PDF`  ←  `feat/d1-settlements-approval-pdf`
- `DESIGN-STD-NAVY-PAGE-BANNER`  ←  `feat/design-std-navy-page-banner`
- `DISP-DRAWER-WIRE`  ←  `feat/disp-drawer-wire`
- `DISP-FACTORING-PACKET`  ←  `feat/disp-factoring-packet`
- `DISP-FINES-DEDUCT`  ←  `feat/disp-fines-deduct`
- `DISP-KANBAN-STATES`  ←  `feat/disp-kanban-states`
- `DISP-LIST-TABLE-ASSIGN`  ←  `feat/disp-list-table-assign`
- `DISP-OVERVIEW`  ←  `feat/disp-overview`
- `DISP-PROFITABILITY`  ←  `feat/disp-profitability`
- `DISP-QUEUES-NAV`  ←  `feat/disp-queues-nav`
- `DISP-ROUNDTRIPS`  ←  `feat/disp-roundtrips`
- `DOCS-AUDIT-LINKAGE-SPECS`  ←  `docs/audit-linkage-specs`
- `DOCS-B9-ESCROW-DESIGN`  ←  `docs/b9-escrow-design`
- `DOCS-DISPATCH-LANE-ENFORCEMENT-V2`  ←  `docs/dispatch-lane-enforcement-v2`
- `DOCS-FACTORING-ACCOUNTING-STRUCTURE`  ←  `feat/factoring-accounting-structure-v3`
- `DOCS-FH1-FIXED-ASSETS-DEPRECIATION`  ←  `docs/fh1-fixed-assets-depreciation`
- `DOCS-FH1-LEASING-FOLLOWUP`  ←  `docs/fh1-leasing-followup`
- `DOCS-FH2-LOAN-WIZARD`  ←  `docs/fh2-loan-wizard`
- `DOCS-FH3-AMORTIZATION-ENGINE`  ←  `docs/fh3-amortization-engine`
- `DOCS-FH4-FINANCE-CALCULATOR`  ←  `docs/fh4-finance-calculator`
- `DOCS-FH5-BANKRUPTCY-MODELER`  ←  `docs/fh5-bankruptcy-modeler`
- `DOCS-FH5-POSTING-LOCKED`  ←  `docs/fh5-posting-locked`
- `DOCS-FH6-TAX-MANAGER`  ←  `docs/fh6-tax-manager`
- `DOCS-FH7-UNIT-ALLOCATION`  ←  `docs/fh7-unit-allocation`
- `DOCS-FH8-LEASE-CONTRACT`  ←  `docs/fh8-lease-contract`
- `DOCS-FINANCE-ANSWERED-QS-FOLLOWUP`  ←  `docs/finance-answered-qs-followup`
- `DOCS-GEOFENCE-INSURANCE-SPEC`  ←  `feat/lock-dispatch-geofence-insurance-spec`
- `DOCS-MILEAGE-LIFECYCLE-CORRECTION`  ←  `docs/mileage-lifecycle-correction`
- `DOCS-MILEAGE-MODEL-ANSWERS`  ←  `docs/mileage-model-answers`
- `DOCS-MILEAGE-MODEL-DESIGN`  ←  `docs/mileage-model-design`
- `DOCS-PERMISSIONS-DESIGN`  ←  `docs/permissions-design`
- `DOCS-QBO-PARITY-CAPTURE-V2`  ←  `docs/qbo-parity-capture-v2`
- `DOCS-RECON-TRACKER-ESCROW-RESEARCH-0614`  ←  `docs/recon-tracker-escrow-research-0614`
- `DOCS-RELAY-INTERNAL-BANK-DESIGN`  ←  `docs/relay-internal-bank-design`
- `DOCS-RLS-COVERAGE-AUDIT`  ←  `docs/rls-coverage-audit`
- `DOCS-ROLE-BINDINGS-WORKSHEET`  ←  `docs/role-bindings-bookkeeper-worksheet`
- `DOCS-VOID-EVERYWHERE-DESIGN`  ←  `docs/void-everywhere-design`
- `E1-SMOKE-SERVICE-TOKEN-AUTH`  ←  `feat/e1-smoke-service-token-auth`
- `FEAT-ACCOUNT-REGISTER-D5`  ←  `feat/account-register-d5`
- `FEAT-B1-EXPENSE-CATEGORY-MAP-SEED`  ←  `feat/b1-expense-category-map-seed`
- `FEAT-B2-POSTING-ENGINE-CASH-ADVANCE`  ←  `feat/b2-posting-engine-cash-advance`
- `FEAT-B3-EMPLOYEE-LOAN-LEDGER`  ←  `feat/b3-employee-loan-ledger`
- `FEAT-B4-DRIVER-REQUEST-AUDIT-TIMELINE`  ←  `feat/b4-driver-request-audit-timeline`
- `FEAT-B5-CASH-ADVANCE-APPROVE-CASCADE`  ←  `feat/b5-cash-advance-approve-cascade`
- `FEAT-B6-DRIVER-INBOX-UI`  ←  `feat/b6-driver-inbox-ui`
- `FEAT-CLASSES-BULK-EDIT`  ←  `feat/classes-bulk-edit`
- `FEAT-DISP-CASHFLOW-LINK`  ←  `feat/disp-cashflow-link`
- `FEAT-DISP-DRAWER-WIRE`  ←  `feat/disp-drawer-wire`
- `FEAT-DISPATCH-PLANNERS-SPLIT-NAV`  ←  `feat/dispatch-planners-split-nav`
- `FEAT-DOCS-UPLOAD-UI`  ←  `feat/docs-upload-ui`
- `FEAT-DRIVER-ESCROW-SUBACCOUNT-V2`  ←  `feat/driver-escrow-subaccount-v2`
- `FEAT-DRIVER-HUB-ROUTE-WIRE`  ←  `feat/driver-hub-route-wire`
- `FEAT-DRIVER-INBOX-REPORTING`  ←  `feat/driver-inbox-reporting`
- `FEAT-DRIVER-SUBACCOUNT-ASSET-PROVISION`  ←  `feat/driver-subaccount-asset-provision`
- `FEAT-DRIVER-SUBACCOUNT-BULK-BACKFILL-DRYRUN`  ←  `feat/driver-subaccount-bulk-backfill-dryrun`
- `FEAT-EXPENSES-PHASE1-5-BUILD`  ←  `feat/expenses-phase1.5-build`
- `FEAT-EXPENSES-PHASE1-FOUNDATION`  ←  `feat/expenses-phase1-foundation`
- `FEAT-EXPENSES-PHASE2-STEP3-POSTING-BUILD`  ←  `feat/expenses-phase2-step3-posting-build`
- `FEAT-EXPENSES-PHASE2-UNCATEGORIZED-SEED`  ←  `feat/expenses-phase2-uncategorized-seed`
- `FEAT-FH-2-LOAN-WIZARD`  ←  `feat/fh-2-loan-wizard`
- `FEAT-FH-3-AMORTIZATION`  ←  `feat/fh-3-amortization`
- `FEAT-FH-4-CALCULATOR`  ←  `feat/fh-4-calculator`
- `FEAT-FH1-FIXED-ASSETS-DATA-MODEL`  ←  `feat/fh1-fixed-assets-data-model`
- `FEAT-HELP-ARTICLE-STUBS`  ←  `feat/help-article-stubs`
- `FEAT-HIDE-STUB-NAV-PAGES`  ←  `feat/hide-stub-nav-pages`
- `FEAT-INSURANCE-POLICY-WIZARD`  ←  `feat/insurance-policy-wizard`
- `FEAT-INVENTORY-PARTS-404-FIX`  ←  `feat/inventory-parts-404-fix`
- `FEAT-PERIODS-INIT-TRK-2025-H2`  ←  `feat/periods-init-trk-2025-h2`
- `FEAT-QBO-PARITY-A1-TABLE-GRAMMAR`  ←  `feat/qbo-parity-a1-table-grammar`
- `FEAT-QBO-PARITY-A3-SIZING`  ←  `feat/qbo-parity-a3-sizing`
- `FEAT-QBO-PARITY-DOCS`  ←  `feat/qbo-parity-docs`
- `FEAT-REEFER-HOURS-POLL-CRON`  ←  `feat/reefer-hours-poll-cron`
- `FEAT-SETTLEMENT-DEDUCTION-LEDGER-DDL`  ←  `feat/settlement-deduction-ledger-ddl`
- `FEAT-SETTLEMENT-RECOVERY-CAPPED-PAYROLL`  ←  `feat/settlement-recovery-capped-payroll`
- `FEAT-SETTLEMENT-RECOVERY-CAPPED-WIRING`  ←  `feat/settlement-recovery-capped-wiring`
- `FEAT-SETTLEMENT-RECOVERY-GL-JE`  ←  `feat/settlement-recovery-gl-je`
- `FEAT-SETTLEMENT-SHADOW-RUN`  ←  `feat/settlement-shadow-run`
- `FEAT-SIDEBAR-V2-REORG-25`  ←  `feat/sidebar-v2-reorg-25`
- `FEAT-TASK-BOARD-CREATE-TASK-UI`  ←  `feat/task-board-create-task-ui`
- `FEAT-TRACKER-EXPORT-GITHUB-TABS`  ←  `feat/tracker-export-github-tabs`
- `FEAT-V0-SIDEBAR-DRIVER-HUB`  ←  `feat/v0-sidebar-driver-hub`
- `FEAT-V2-A2-REFERENCE-SELECT`  ←  `feat/v2-a2-reference-select`
- `FEAT-VOID-EVERYWHERE-PR1`  ←  `feat/void-everywhere-pr1`
- `FEAT-VOID-EVERYWHERE-PR2`  ←  `feat/void-everywhere-pr2-bills`
- `FIX-AT-RISK-LOADS-SD-CITY`  ←  `fix/at-risk-loads-sd-city`
- `FIX-AUDIT-KPI-DRIFTS`  ←  `fix/audit-kpi-drifts`
- `FIX-AUDIT-NESTED-MODALS`  ←  `fix/audit-nested-modals`
- `FIX-AUDIT-PROD-STUBS`  ←  `fix/audit-prod-stubs`
- `FIX-AUDIT-TEST-DATA-LEAK`  ←  `fix/audit-test-data-leak`
- `FIX-CI-YML-CONFLICT-MARKERS`  ←  `fix/ci-yml-clean`
- `FIX-COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE`  ←  `fix/coa-uncategorized-expense-qbo-reconcile`
- `FIX-DEPLOY-MIGRATION-DRIFT`  ←  `fix/deploy-migration-drift`
- `FIX-DISPATCH-SUBNAV-ROUTING`  ←  `fix/dispatch-subnav-routing`
- `FIX-DOUBLE-STRINGIFY-SWEEP-NONMONEY`  ←  `fix/double-stringify-sweep-nonmoney`
- `FIX-FINANCE-DOUBLE-STRINGIFY-SWEEP`  ←  `fix/finance-double-stringify-sweep`
- `FIX-FUEL-SUBNAV-ROUTING`  ←  `fix/fuel-subnav-routing`
- `FIX-GUARD-M2-FK-DETECTION`  ←  `fix/guard-m2-fk-detection`
- `FIX-INSURANCE-POLICY-UNIT-IS-ACTIVE`  ←  `fix/insurance-policy-unit-is-active`
- `FIX-P8-AUDIT-NESTED-MODALS`  ←  `fix/audit-nested-modals-fresh`
- `FIX-REMOVE-LEFT-SIDEBAR-HOVER-DROPDOWN`  ←  `fix/remove-left-sidebar-hover-dropdown`
- `FIX-RLS-BILL-EXPENSE-LINES`  ←  `fix/bill-lines-rls-and-role-bindings`
- `FIX-SAMSARA-WEBHOOKS-INVESTIGATION`  ←  `fix/samsara-webhooks-investigation`
- `FIX-STEP3-POSTING-BALANCED-JE-PROOF`  ←  `fix/step3-posting-balanced-je-proof`
- `FIX-TASK-CREATE-DOUBLE-STRINGIFY`  ←  `fix/task-create-double-stringify`
- `FIX-TEST-JSDOM-ENV-MISSING`  ←  `fix/test-jsdom-env-missing`
- `FIX-URL-NORMALIZE`  ←  `fix/url-normalize`
- `GAP-20`  ←  `feature/gap-20-recurring-bills`
- `GAP-20`  ←  `feature/gap-20-recurring-bills`
- `GAP-25`  ←  `feature/gap-25-active-driver-set`
- `GAP-25`  ←  `feature/gap-25-active-driver-set`
- `GAP-26`  ←  `feature/gap-26-border-geofences`
- `GAP-27`  ←  `feature/gap-27-geofence-reconciliation`
- `GAP-31`  ←  `feature/gap-31-multi-stop-extra-rates`
- `GAP-32`  ←  `feature/gap-32-free-time-detention`
- `GAP-36`  ←  `feature/gap-36-incident-reporting`
- `GAP-37`  ←  `feature/gap-37-equipment-transfer`
- `GAP-37`  ←  `feature/gap-37-equipment-transfer`
- `GAP-42`  ←  `feature/gap-42-ifta-preparer`
- `GAP-42`  ←  `feature/gap-42-ifta-preparer`
- `GAP-43`  ←  `feature/gap-43-scheduled-reports`
- `GAP-43`  ←  `feature/gap-43-scheduled-reports`
- `GAP-45`  ←  `feature/gap-45-cashflow-per-truck`
- `GAP-46`  ←  `feature/gap-46-integrity-alerts`
- `GAP-47`  ←  `feature/gap-47-dispatch-auth`
- `GAP-51`  ←  `feature/gap-51-data-sovereignty`
- `GAP-52`  ←  `feature/gap-52-driver-qbo-vendor`
- `GAP-53`  ←  `feature/gap-53-bank-drift-fix`
- `GAP-54`  ←  `feature/gap-54-arrival-prompt`
- `GAP-55`  ←  `feature/gap-55-realtime-gps`
- `GAP-56`  ←  `feature/gap-56-auto-status`
- `GAP-57`  ←  `feature/gap-57-dispatch-status`
- `GAP-58`  ←  `feature/gap-58-engine-fault-wo`
- `GAP-59`  ←  `feature/gap-59-vehicle-driver-pairing`
- `GAP-60`  ←  `feature/gap-60-driver-scoring`
- `GAP-64`  ←  `feature/gap-64-cargo-sensors`
- `GAP-71`  ←  `feature/gap-71-driver-retention`
- `GAP-71`  ←  `feature/gap-71-driver-retention`
- `GAP-72`  ←  `feature/gap-72-customer-score`
- `GAP-72`  ←  `feature/gap-72-customer-score`
- `GAP-86-POLICY-WIZARD`  ←  `feat/insurance-policy-wizard`
- `GAP-CI-WIRE-PREPUSH-GUARDS`  ←  `feat/gap-ci-wire-prepush-guards`
- `GAP-DOUBLE-ENTRY-DB-ENFORCEMENT`  ←  `feat/tier1-double-entry-guard`
- `GAP-E-PLANNER-TASKS-ROUTES`  ←  `fix/gap-e-planner-tasks-routes`
- `GAP-IDEMP-KEYS`  ←  `feat/insurance-policy-wizard`
- `GLOBAL-SORT-RULE`  ←  `feat/global-sort-rule`
- `LOCKDOWN-ENFORCEMENT-GUARDS`  ←  `feat/lockdown-enforcement-guards`
- `M1-POSITIONED-PARTS`  ←  `feat/m1-positioned-parts`
- `M2-INTEGRITY-POSITION-HISTORY`  ←  `feat/m2-integrity-position-history`
- `MIGRATION-RUNNER-HARDEN`  ←  `feat/migration-runner-harden`
- `OB1-NAV-HEADER-UNIFY`  ←  `feat/ob1-nav-header-unify`
- `P0-BLOCK-3-DRIVER-LOAD-HISTORY`  ←  `feat/driver-load-history-tab`
- `P5-T6-BANKING-TRANSFER`  ←  `feat/p5-t6-banking-transfer-test-fix`
- `SETTLEMENTS-SIDEBAR-RENAME-MOVE`  ←  `feat/settlements-sidebar-rename-move`
- `SHADOW-ROUTE-REDIRECTS`  ←  `fix/shadow-route-redirects`
- `SIDEBAR-INSURANCE`  ←  `feat/sidebar-insurance-clean`
- `SMOKE-TOKEN-AUTH`  ←  `fix/SMOKE-TOKEN-AUTH`
- `TASKS-PLANNER-REDESIGN-V3`  ←  `feat/tasks-planner-redesign-v3`
- `TEST-COPY-TO-ACCOUNTING-LINES-BILL-BRANCH`  ←  `test/copy-to-accounting-lines-bill-branch`
- `TIER14-MEXICO-OPS`  ←  `feat/tier14-mexico-ops`
- `TIER15-MECHANIC-SHOP`  ←  `feat/tier15-mechanic-shop`
- `TIER20-SECRETS-ROTATION`  ←  `feat/tier20-secrets-rotation`
- `TIER21-DR-DRILL`  ←  `feat/tier21-dr-drill`
- `TIER23-DEGRADATION`  ←  `feat/tier23-degradation`
- `TIER26-PARTITION`  ←  `feat/tier26-partition`
- `TIER27-CANARY`  ←  `feat/tier27-canary`
- `TIER28-VENDOR-LOCKIN`  ←  `feat/tier28-vendor-lockin`
- `TIER29-KNOWN-LIMITATIONS`  ←  `feat/tier29-known-limitations`
- `W1A-EVENT-LOG-IMMUTABLE`  ←  `fix/w1a-append-only`
- `W1B-TASKS-MODULE`  ←  `feat/w1b-tasks-module`
- `W2A-PROFITABILITY-ENGINE`  ←  `feat/w2a-profitability`
- `W2B-ALERT-RULES-PROFILES`  ←  `feat/w2b-alert-rules`
- `W2P-PLANNER-REDESIGN`  ←  `feat/w2p-planner-redesign`
- `W3A-GEOFENCE-ENGINE`  ←  `feat/w3a-geofence`
- `W3B-FORCED-DRIVER-ACK`  ←  `feat/w3b-forced-driver-ack`
- `W4A-SIGNED-SAFETY-DOCS`  ←  `feat/w4a-signed-safety-docs`
- `W4B-BROKER-AUTO-UPDATE`  ←  `feat/w4b-broker-auto-update`
- `W5-TIME-UTILIZATION`  ←  `feat/w5-time-utilization`
