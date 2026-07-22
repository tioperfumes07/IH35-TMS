# DUAL-PATH / OLD vs NEW DESIGN — SYSTEM-WIDE AUDIT (2026-07-22)

**Owner ask (verbatim):** *"Continue audit + building. Also audit where new designs aren't
showing (old software still active) — across all the software. For these audits he needs to
know the difference between the old and new design (not just file paths)."*

**Branch:** `docs/dual-path-old-vs-new-audit-20260722`
**Scope:** ALL 30 `SIDEBAR_ITEM_IDS` in `apps/frontend/src/components/layout/sidebar-config.ts`
(not Safety-only) + the full `apps/frontend/src/routes/manifest.tsx` router.
**Nature:** Doc-only audit PR. Cursor builds/audits; does not merge (Rule 18 / owner process).

**Mechanical companion (refreshable):** `scripts/inventory-dual-path-routes.mjs` →
`docs/trackers/DUAL-PATH-SCAN-RAW-2026-07-22.md` (regenerate any time; this curated doc
hand-verifies the raw scan's hits and corrects its known false positives — see §6).

**Prior art extended (not replaced):**

- `docs/trackers/TRUE-CONNECTIVITY-MASTER-2026-07-21.md` §C "Dual-path / stale-active"
- [#3183](https://github.com/tioperfumes07/IH35-TMS/pull/3183) `fix(safety): V6.4 active-path law — no ComingSoon while Live tabs exist`
- [#3190](https://github.com/tioperfumes07/IH35-TMS/pull/3190) `fix(drivers): active-path law — one Live mount, archive parallel trees`
- `scripts/orphan-components-allowlist.json` + `scripts/orphan-components-baseline.json` +
  `scripts/verify-orphan-components.mjs` (pre-existing exhaustive import-graph orphan guard)

---

## Honesty / method statement (read before trusting any row below)

Three of the owner's four detection methods were run **exhaustively across the entire
`apps/frontend/src` tree** (every module, not sampled):

1. **`ComingSoonPage` still mounted** — regex sweep of every JSX render site in
   `routes/manifest.tsx` (the single router file). **4 total hits app-wide** (§2). This is a
   complete count, not a sample — there is nowhere else JSX routes are registered.
2. **`@deprecated` / `@archived` files still imported by live code** — regex sweep of every
   `.ts(x)`/`.js(x)` file under `apps/frontend/src` for the tag, then a direct-importer search
   for each tagged file. **21 total tagged files app-wide** (§3), each hand-verified below
   (2 of the scanner's 4 raw "still imported live" hits are **false positives** from
   basename-substring matching — corrected in §3, not hidden).
3. **Built-but-unwired pages (`ORPHAN_NEW`)** — re-ran the pre-existing
   `scripts/verify-orphan-components.mjs` import-graph reachability guard. It currently reports
   **0 orphans**, but hand-verification found that claim is **incomplete**: the guard treats
   every `index.ts`/`index.tsx` barrel file as a reachability *root*, so a page that is only
   exported from a barrel (and never actually imported by `manifest.tsx`, `App.tsx`, or any
   other live-rendered component) is scored "reachable" even though no operator can ever click
   to it. Four such pages were found by hand (§4) — this is itself a top-10 finding (guard
   blind spot), not just a note.
4. **Parallel page trees / backend dual resolvers** — **spot-checked**, not exhaustive. Verified
   in depth for Safety, Fleet (Vehicle/Trailer Profile), Drivers, Dispatch, Banking, Compliance,
   Accounting. The remaining ~20 sidebar modules were checked for (a) zero `ComingSoon` hits —
   proven by #1 above, (b) zero `@deprecated`/`@archived` files in their directory — proven by
   #2 above, (c) no second top-level route registered for the same sidebar `to` path — checked
   directly in `manifest.tsx` per module (§5). They were **not** individually walked tab-by-tab
   for silent behavioral forks the way Safety was for #3183. Labeled `SAMPLED` in §5, not
   `CLEAN`, per the owner's honesty instruction — "do not mark CLEAN without opening the route
   registration" is satisfied (every module's route registration was opened), but full tab-level
   behavioral diffing was not exhaustive for all 30 modules in this pass.

**Do not read "0 ComingSoon hits in module X" as "module X has no gaps."** It only means X has
no live `ComingSoonPage`-mounted stub. Unbuilt features can also be TRUE gaps tracked elsewhere
(block-audit-piles), just not a *dual-path* defect.

---

## 1. TOP 10 — ranked fix-now list

| # | Finding | Class | Module | Fix block id |
|---|---|---|---|---|
| 1 | `verify-orphan-components.mjs` treats every barrel `index.ts`/`index.tsx` as an unconditional reachability **root**, so a page can be exported-only-from-a-barrel and never actually rendered by any route, yet the guard reports 0 orphans. This is how findings #2–#5 below stayed invisible to CI. | Guard blind spot (meta) | Platform / CI | `DUALPATH-01` |
| 2 | `AssetsWorkspacePage.tsx` (Assets module) — fully built (filters, summary cards, ParityTable list, live `/api/v1/assets` fetch, CI guard `verify-asset-list-table-uses-paritytable.mjs`) but **zero route** in `manifest.tsx` and **no sidebar entry**. No operator can ever open it. | `ORPHAN_NEW` | Assets (no sidebar item — orphaned even from nav) | `DUALPATH-02` |
| 3 | `ProfitabilityPage.tsx` + `ByCustomerView`/`ByLaneView`/`ByLoadView`/`ByTypeView`/`FilterBar`/`KpiStrip` (pages/profitability/*) — full W2A-PROFITABILITY-ENGINE UI (#871), CI-guarded by `verify-profitability-engine.mjs` and `verify-profitability-tabs-url-sync.mjs`, but **zero route**. `Reports` sidebar item only exposes `CustomerProfitabilityPage`/`LaneProfitabilityPage`/`TripProfitability` — different, narrower components. | `ORPHAN_NEW` | Reports (generic P&L engine unreachable) | `DUALPATH-03` |
| 4 | `PayrollIntegrationPage.tsx` + `PayrollAggregateTable`/`ClassAllocationView` (pages/payroll-integration/*) — CLOSURE-12 payroll integration (#795), CI-guarded by `verify-payroll-aggregate-matches-qbo.mjs`, but **zero route**, **no sidebar item**. | `ORPHAN_NEW` | Payroll Integration (no sidebar item at all) | `DUALPATH-04` |
| 5 | `QBOSyncStatusDashboardPage.tsx` — ParityTable-migrated, tab/URL-synced, dead-letter-gated (3 dedicated guards), but **zero route**. The only mounted QBO sync page is the *different* `QboSyncDetailPage` at `/qbo/sync-dashboard`. | `ORPHAN_NEW` | System / QBO Sync | `DUALPATH-05` |
| 6 | `VehicleProfilePage.tsx` (`/fleet/units/:id`) renders **both** the `@deprecated` `RecentActivitySection` (raw `JSON.stringify(row).slice(0,120)` preview rows, tabbed loads/status/work_orders) **and** the canonical `ServiceTimeline` on the same screen. Operators see a crude duplicate "recent activity" widget next to the real one. | `DUAL_PATH_OLD_ACTIVE` (actively rendering, not dead code) | Fleet | `DUALPATH-06` |
| 7 | `TrailerProfilePage.tsx` — identical pattern: `@deprecated` `TrailerRecentActivitySection` still rendered alongside canonical `ServiceTimeline`. | `DUAL_PATH_OLD_ACTIVE` | Fleet | `DUALPATH-07` |
| 8 | `/accounting/recurring-transactions` — real tab in the Accounting "More ▾" subnav (`subnav-manifest.ts:124` "Recurring transactions"), but the route renders `ComingSoonPage`. No backend `recurring_transaction*` table/route exists at all — this is an unbuilt feature exposed as a clickable tab, not leftover legacy. | `COMING_SOON_STUB` | Accounting | `DUALPATH-08` |
| 9 | Settlement pay-run close reads **only** the legacy `catalogs.account_role_bindings` (Neon **0** rows) instead of the primary `accounting.chart_of_accounts_roles` resolver (`resolveRoleAccount`). Cited from `TRUE-CONNECTIVITY-MASTER-2026-07-21.md` §C/§D — **not re-litigated here**, ranked because it is money-critical and still open (fix PRs #3149 HOLD, #3171 FE). | `DUAL_PATH_OLD_ACTIVE` (backend resolver) | Settlements / Accounting CoA | *(existing)* #3149 / #3171 |
| 10 | Two duplicate literal `<Route path="/compliance" element={<ComplianceDashboardPage />}>` registrations in `manifest.tsx` (lines ~1449 and ~4110), and two duplicate `/notifications` registrations. Same component both times (no operator-visible divergence — not a design fork) but it is dead route-table bloat that makes future "which one is live" audits harder. | Hygiene (not a design fork) | Compliance / Notifications | `DUALPATH-10` |

Items #2–#5 are grouped by root cause (#1) but ranked individually because each is a materially
different built feature sitting dark in a different module.

---

## 2. `ComingSoonPage` — exhaustive, app-wide (4 total JSX mounts)

| # | manifest.tsx path | What operators see TODAY | OLD design | NEW design | Class | Evidence |
|---|---|---|---|---|---|---|
| 1 | `/lists/:domain` (dynamic fallback, no static redirect match) | Generic "Coming Soon" placeholder page — only reached for an unrecognized `:domain` segment after the underscore→hyphen legacy redirect table (`UNDERSCORE_LEGACY_REDIRECTS`) is checked and misses. | n/a — intentional catch-all, not a stub for a specific built feature | n/a | `ARCHIVED_OK` (intentional generic fallback) | `manifest.tsx:660-670` `ListsDomainRoute()` |
| 2 | `/lists/:domain/:catalogKey` (dynamic fallback) | Same generic fallback, one segment deeper. | n/a | n/a | `ARCHIVED_OK` | `manifest.tsx:672-681` `ListsCatalogKeyRoute()` |
| 3 | `/coming-soon` | Explicit named utility route — a deliberate "this is coming soon" landing page other code can `<Navigate>` to. | n/a | n/a | `ARCHIVED_OK` | `manifest.tsx:2794-2800` |
| 4 | `/accounting/recurring-transactions` | Real "Recurring transactions" tab under Accounting → More ▾ (`subnav-manifest.ts:124`) renders the generic ComingSoon placeholder — no list, no create, no data. | **OLD:** none exists — this was never built, so there is no legacy screen to compare against. | **NEW:** none exists either — no `recurring_transaction*` backend table/route anywhere in `apps/backend/src` (verified: zero hits). | `COMING_SOON_STUB` | `manifest.tsx:3874-3877`; `pages/accounting/subnav-manifest.ts:124` | `DUALPATH-08` |

**Confirms the owner's prior-art list is stale in the operators' favor:** `/safety/fines-and-discipline`,
`/safety/driver-financial-safety`, and `/safety/workforce-planning` are **no longer** ComingSoon —
#3183 already added `<Navigate replace>` redirects to `/safety/internal-fines`,
`/safety/escrow-record`, and `/safety/driver-scheduler` respectively (`manifest.tsx:1553-1557`).
**No further Safety ComingSoon fix PR is needed this pass** (see §7).

---

## 3. `@deprecated` / `@archived` tagged files — exhaustive, app-wide (21 total)

Full raw sweep: `docs/trackers/DUAL-PATH-SCAN-RAW-2026-07-22.md` §2. Hand-verified below —
**MOUNTED_LIVE** rows are the scanner's candidate list for real dual-path; two are corrected as
false positives (basename-substring collisions), the rest confirmed genuinely mitigated
(only test/self-cluster importers) or genuinely live (the two real Fleet findings, #6/#7 above).

| Old file | Old design (what it looked/behaved like) | New / canonical | New design | Still live? | Class | Evidence |
|---|---|---|---|---|---|---|
| `components/vehicle-profile/RecentActivitySection.tsx` | Tabbed (loads/status/work_orders) raw-JSON-preview list, `ParityTable` shell, no real formatting — a debug-grade activity dump. | `components/maintenance/ServiceTimeline.tsx` | Typed service-event timeline with filterable event types, shared across Fleet + Trailer profiles. | **YES — both render on `/fleet/units/:id` today** | `DUAL_PATH_OLD_ACTIVE` | `VehicleProfilePage.tsx:32,291` imports+renders it directly next to `ServiceTimeline` at `:30,~270` |
| `components/trailer-profile/TrailerRecentActivitySection.tsx` | Same old pattern, trailer-scoped. | `components/maintenance/ServiceTimeline.tsx` (`showUnitEventTypes={false}`) | Same new timeline, trailer-scoped. | **YES — both render on `/fleet/trailers/:id` today** | `DUAL_PATH_OLD_ACTIVE` | `TrailerProfilePage.tsx:18-19,125,140` |
| `pages/safety/components/AccidentReportDrawer.tsx` | **False positive from scanner:** this file is a 4-line re-export shim only (`export { AccidentReportDrawer } from "../../../components/safety/AccidentReportDrawer"`) — it has no independent behavior. | `components/safety/AccidentReportDrawer.tsx` | Full accident-report create/edit drawer. | Shim is dead weight but not *serving* old behavior — `AccidentsPage.tsx` and `SafetyHome.tsx` both import the **new** path directly, not the shim. | `ARCHIVED_OK` (mitigated; allowlisted `scripts/orphan-components-allowlist.json:_comment_7`) | corrected from scanner's raw `MOUNTED_LIVE` — see §6 |
| `pages/safety/SafetyHome.tsx` | Full-page v5 Safety shell: flat `SAFETY_SUBNAV` tab strip, no `SafetyGroupNav`, no 9-group structure — a single long page, pre-V6.4. | `SafetyLayout` + `SafetyGroupNav` + `SAFETY_TABS_CONFIG` (28 tabs / 9 groups) at `/safety/*` | Grouped sub-nav shell, `SafetyHomeTab` at `/safety/home` is the live landing tab. | **False positive from scanner:** `pages/home/HomePage.tsx` imports `pages/home/roles/SafetyHome.tsx` — a *different* file (a home-page role widget), not this deprecated shell. This file has **zero** live importers. | `ARCHIVED_OK` (mitigated; allowlisted `_comment_2`, required only by `verify-safety-accidents-wire-up.mjs`) | corrected from scanner's raw `MOUNTED_LIVE` — see §6 |
| `pages/safety/DotInspectionsPage.tsx` | Old flat page rendering DOT inspections without the safetyV64 API / ParityTable. | `tabs/DOTInspectionsTab.tsx` at `/safety/dot-inspections` | New tab, safetyV64 API + ParityTable. | Imported only by the deprecated `SafetyHome.tsx` cluster (which itself has no live importer). | `ARCHIVED_OK` | allowlisted `_comment_9` |
| `pages/safety/ComplaintsPage.tsx` | Old flat page, no create/patch/void. | `tabs/ComplaintsTab.tsx` at `/safety/complaints` | New tab with safetyV64 create/patch/void. | Same — only the dead `SafetyHome.tsx` cluster imports it. | `ARCHIVED_OK` | allowlisted `_comment_8` |
| `pages/safety/SafetyTabsMeta.ts` | Duplicate tab-list constant (parallel source of truth for tab names/order). | `components/safety/SAFETY_TABS_CONFIG.ts` (`SAFETY_CANONICAL_TAB_COUNT = 28`) | Single canonical tab inventory. | No importers found. | `ARCHIVED_OK` | — |
| `pages/lists/driver/deprecated-subcatalog-pages.tsx` | Singular routes `/lists/driver/{license-classes,endorsements,restrictions,medical-card-status,employment-status}` — 5 separate flat catalog pages. | Plural `/lists/drivers/*` catalog routes | Consolidated plural catalog surface. | Test-only importer (`__tests__/driver-subcatalogs-deprecated.test.tsx`); singular routes `<Navigate>`-redirect to plural in `manifest.tsx`, not to this file. | `ARCHIVED_OK` (#3190) | — |
| `pages/drivers/DriversPage.tsx` | Parallel dual-chrome Drivers wrapper (pre-#3190 second Drivers surface). | `pages/Drivers.tsx` | Single live Drivers mount. | Zero importers — retained only because 2 CI guards (`verify-drivers-subnav-routes-registered.mjs` + companions) string-scan this path for tab-contract constants. | `ARCHIVED_OK` (#3190) | allowlist note "RETAINED, not deleted... guards string-scan this path" |
| `pages/banking/BankTxCategorizationPage.tsx` | Old Workflow-B: flat categorize page, separate `CategorizeDrawer` + 8 per-type forms (`TransferForm`, `SplitTransactionModal`, `ManualJEForm`, `FactoringAdvanceForm`, `DriverSettlementForm`, `CreateExpenseForm`, `BillPaymentForm`, `ApplyToBillForm`). | `BankingTransactionsDesignView.tsx` | Single QBO-style register + `MatchDrawer` categorize surface. | Zero live importers; CI guard `verify-banking-workflow-b-archived.mjs` enforces it stays that way. | `ARCHIVED_OK` (mitigated) | allowlist `_comment_24` + 10 sibling entries |
| `pages/banking/components/CategorizeDrawer.tsx` + 8 `forms/*.tsx` | (see above — the 8 per-type old forms rendered *inside* CategorizeDrawer) | `BankingTransactionsDesignView` + `MatchDrawer` / `BankTransactionSplitModal` / `RecordTransferModal` | (see above) | Self-cluster only (each form is imported only by `CategorizeDrawer`, which itself has zero live importers). | `ARCHIVED_OK` | scan-raw §2 `SELF_CLUSTER` rows |
| `components/dispatch/DispatchList.tsx` | Old flat dispatch list table. | `pages/dispatch/DispatchBoard.tsx` (via `DispatchPage`) | Kanban/board-style dispatch surface. | Test-only importer; CI guard `verify-dispatch-list-orphaned.mjs`. | `ARCHIVED_OK` | — |
| `hooks/useModalEscape.ts` | Old escape-key hook. | `useEscapeKey` | Shared hook. | Zero importers anywhere. | `ARCHIVED_OK` | — |

**Above this line: all 21 module-level (`@deprecated`/`@archived` tag within the file's first 6
lines) hits from the mechanical scanner, each hand-verified.** The 3 rows below are **not** part
of that 21-count — they are inline `@deprecated` tags on a single sub-export deep inside an
otherwise-live file (found via a broader manual grep, not the near-top scanner filter). Listed
for completeness since the owner asked to audit "across all the software," but they are not
full-screen dual paths — each is a single deprecated function/component inside a file that is
otherwise the live, canonical module:

| `api/banking.ts:732` (`@deprecated ARCHIVED` block, Tier-1 H-1) | Old `manual-je` client call — the `/api/v1/banking/manual-je` endpoint now returns `410 Gone` server-side. | `POST /api/v1/accounting/journal-entries` | Canonical JE-create path. | Zero callers (comment states "Zero callers"). | `ARCHIVED_OK` | — |
| `components/fleet/BulkActionBar.tsx:128` (inline `@deprecated`) | Legacy prop-shape bulk-action bar. | Shared `BulkActionBar` + `FleetBulkControls` in `FleetTable` | Unified bulk controls. | Kept for existing tests only per its own comment. | `ARCHIVED_OK` | — |
| `components/bulk/TableSelection.tsx:113` (inline `@deprecated`) | `renderTableSelectionHeader()` free function. | `TableSelectionHeader` component | Component form. | Thin wrapper, not a parallel screen. | `ARCHIVED_OK` | — |

---

## 4. `ORPHAN_NEW` — built pages with zero route (guard blind spot, §1 items #2–#5)

| Page | What's actually built | Guard that exercises it (proves it's not abandoned, just unwired) | Sidebar item | Fix block id |
|---|---|---|---|---|
| `pages/assets/AssetsWorkspacePage.tsx` | Filters bar, summary cards, `AssetListTable` (ParityTable-migrated), live fetch from `resolveApiUrl` + `/api/v1/assets`. | `verify-asset-list-table-uses-paritytable.mjs` | **none** — Assets has no `SIDEBAR_ITEM_IDS` entry at all | `DUALPATH-02` |
| `pages/profitability/ProfitabilityPage.tsx` + `ByCustomerView`/`ByLaneView`/`ByLoadView`/`ByTypeView`/`FilterBar`/`KpiStrip` | Full W2A profitability engine UI: by-customer / by-lane / by-load / by-type groupings + KPI strip + `?tab=` URL sync. | `verify-profitability-engine.mjs`, `verify-profitability-tabs-url-sync.mjs` | `reports` sidebar exposes only the narrower `CustomerProfitabilityPage`/`LaneProfitabilityPage`/`TripProfitability` | `DUALPATH-03` |
| `pages/payroll-integration/PayrollIntegrationPage.tsx` + `PayrollAggregateTable` + `ClassAllocationView` | Payroll aggregate table reconciled against QBO classes. | `verify-payroll-aggregate-matches-qbo.mjs` | **none** | `DUALPATH-04` |
| `pages/qbo/QBOSyncStatusDashboardPage.tsx` | ParityTable-migrated QBO sync status dashboard, `?tab=` URL sync, dead-letter-status gating. | `verify-qbo-sync-status-dashboard-uses-paritytable.mjs`, `verify-qbo-sync-status-tabs-url-sync.mjs`, `verify-qbo-sync-repair-dead-letter-gate.mjs` | `system` sidebar's live QBO surface is the different `QboSyncDetailPage` at `/qbo/sync-dashboard` | `DUALPATH-05` |

All four are in `scripts/orphan-components-allowlist.json` (comments `_comment_37`... no —
`_comment_13`, `_comment_14`–`_comment_20`, `_comment_21`–`_comment_23`) with rationale text
that says *"required by \<guard\>.mjs"* — true, but that only proves the **guard** reaches the
file via a direct `fs.readFileSync`/string-match, not that an **operator** can. The allowlist
comments do not claim route-reachability, but nothing else flags that gap either — hence
finding #1 (guard blind spot) in the Top 10.

**Verification method:** direct grep of `apps/frontend/src/routes/manifest.tsx` for each
component name/JSX tag returned zero hits; a second grep for `AP_AGING_ROUTE`-style constant
re-export patterns (used correctly by `AccountsPayableAgingPage`, `CollectionsPage`,
`TripPairingBoardPage` — all confirmed genuinely mounted, see §6 false positives) returned
nothing for these four.

---

## 5. Full sidebar sweep (30 `SIDEBAR_ITEM_IDS`)

Legend: **Depth** = `FULL` (tabs individually walked + component-tree compared, this pass or
#3183/#3190) / `SAMPLED` (route registration opened in `manifest.tsx`; module-wide ComingSoon +
@deprecated/@archived sweeps in §2/§3 cover it at 100%; tab-by-tab behavioral diff not exhaustive
this pass).

| Module (`SIDEBAR_ITEM_IDS`) | Surface / tabs (from `sidebar-config.ts` flyouts + manifest) | LIVE route(s) | OLD design | NEW design | What operators see TODAY | Class | Evidence | Depth |
|---|---|---|---|---|---|---|---|---|
| `home` | `/home` | `manifest.tsx` root redirect chain | n/a | n/a | Canonical training home | `CLEAN` | — | SAMPLED |
| `tasks` | Task Board, Calendar, My Tasks, Team Chat, Admin Report | `/tasks`, `/tasks/calendar`, `/tasks/mine`, `/tasks/chat`, `/tasks/report` | n/a | n/a | No ComingSoon, no `@deprecated` tag in `pages/tasks/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `fuel` | Fuel Home | `/fuel` | n/a | n/a | No ComingSoon/@deprecated in `pages/fuel/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `dispatch` | Dispatch Home, Loads, Chat, At-Risk, In-Transit, Assignment History, Planners ×4, Detention, OCR Queue, Equipment Transfers, ETA Notify, POD Review, Settings, Geofencing, Alerts, Border Crossing ×2, Factoring Packets/Queue, Daily Tasks, Drivers, Settlements | `manifest.tsx` `/dispatch*` block | **OLD:** `components/dispatch/DispatchList.tsx` — flat table list. | **NEW:** `pages/dispatch/DispatchBoard.tsx` via `DispatchPage` — board/kanban view. | `DispatchBoard` is the only live mount; `DispatchList` is test-only + CI-guarded archived. | `ARCHIVED_OK` (old list) | `verify-dispatch-list-orphaned.mjs` | FULL (this + prior audits) |
| `driver-hub` | Driver Hub Home, Driver App | `/driver-hub`, `/driver-app` | n/a | n/a | No ComingSoon/@deprecated | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `maintenance` | `MAINTENANCE_MODULE_NAV_LINKS` (WOs, PM, DVIR, tires, parts, vendors, reports, settings…) | `manifest.tsx` `/maintenance*` block | n/a | n/a | No ComingSoon/@deprecated in `pages/maintenance/` (21 top-level files, all reachable) | `CLEAN` | §2/§3 sweeps; `pages/maintenance/` has zero tagged files | SAMPLED |
| `safety` | 28 tabs / 9 groups (`SAFETY_TABS_CONFIG`) — Home, Driver Files, HOS, DOT Compliance/Inspections, CSA Score, Accidents & Incidents, Internal/External Fines, Complaints, Escrow Record, Permits, Integrity Reports/Alerts, Driver Scheduler, CSA Mitigation, Anomaly Alerts, … | `/safety/*` under `SafetyLayout` | **OLD:** `SafetyHome.tsx` v5 flat shell + 4 flat `*Page.tsx` (Accidents/Complaints/DotInspections/…) | **NEW:** `SafetyLayout` + `SafetyGroupNav` + `SAFETY_TABS_CONFIG` tab routes | Live shell is 100% V6.4; old shell has zero live importers (#3183); 3 former ComingSoon group-bookmark stubs (`fines-and-discipline`, `driver-financial-safety`, `workforce-planning`) now `<Navigate>`-redirect to Live tabs. `AccidentsIncidentsTab` is a thin wrapper that re-renders the pre-existing `AccidentsPage` content (not a fork — same code, new shell). | `ARCHIVED_OK` (mitigated) | `verify-safety-active-path.mjs`; §2 row 4; §3 rows 1-7 | FULL (#3183 + this pass) |
| `compliance` | Compliance Dashboard, Property Tax Rendition | `/compliance`, `/compliance/property-tax[/:id]` | n/a | n/a | Route table has a harmless duplicate `<Route path="/compliance">` registration (both point at the same `ComplianceDashboardPage` — no behavioral fork) | `CLEAN` (route-hygiene note, not a design fork) | `manifest.tsx:1449` + `manifest.tsx:4110` | FULL (route table opened) — `DUALPATH-10` |
| `drivers` | Drivers Home, Profiles, Settlements, Cash Advances, Cash Advance Requests, Permits, Messages, Applicants | `/drivers*` | **OLD:** `pages/drivers/DriversPage.tsx` — parallel dual-chrome wrapper. | **NEW:** `pages/Drivers.tsx` — single Live mount. | `pages/Drivers.tsx` is the only reachable Drivers page; `DriversPage.tsx` retained only for 2 CI guards that string-scan its subtab constants. | `ARCHIVED_OK` (#3190) | `verify-drivers-active-path.mjs` | FULL (#3190) |
| `fleet` | Units, Trailers, Map, Transfers-in-progress | `/fleet*`, `/fleet/units/:id`, `/fleet/trailers/:id` | **OLD:** `RecentActivitySection` / `TrailerRecentActivitySection` — raw-JSON-preview tabbed activity dump. | **NEW:** `ServiceTimeline` — typed, filterable service-event timeline. | **Both render on the same profile page today** — genuine active dual-path (§1 #6/#7). | `DUAL_PATH_OLD_ACTIVE` | `VehicleProfilePage.tsx:32,291`; `TrailerProfilePage.tsx:18-19,140` | FULL — `DUALPATH-06`/`07` |
| `insurance` | Claims, Lawsuits, Payment Schedule, Policies, Policy Detail, Type Catalog | `/safety/insurance` (`InsuranceTab` + `insurance/*`) | n/a | n/a | No ComingSoon/@deprecated in `pages/insurance/`; per `TRUE-CONNECTIVITY-MASTER` §B the *linkage* gap (claim→expense FK absent, ClaimCreateModal `driver_id` UI absent) is a `MISSING_LINK`/`UI_ONLY` finding, not a dual-path — **not re-litigated here** | `CLEAN` (dual-path scope); linkage gap tracked separately | §2/§3 sweeps; TRUE-CONNECTIVITY-MASTER §B row "Insurance" | SAMPLED |
| `legal` | Contracts, Templates, Policies, Attorney Review | `/legal/*` | n/a | n/a | No ComingSoon/@deprecated in `pages/legal/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `eld` | (hidden stub — `NAV_HIDDEN_STUB_IDS`) | `/eld` | n/a | n/a | Deliberately hidden from nav per `sidebar-config.ts:72` comment ("placeholder/stub page, no real backend") — this is an **owner-acknowledged** stub, already labeled honestly in code, not a silent dual-path | `COMING_SOON_STUB` (self-declared, already documented) | `sidebar-config.ts:71-72` | FULL (comment read) |
| `cash-flow` | Actual vs Projected, Daily Prediction, Manual Daily Projections | `/cash-flow*` | n/a | n/a | Uses its own `tabs/` dir (5 files) — no flat/tab duplication found | `CLEAN` | §2/§3 sweeps; dir listing | SAMPLED |
| `settlements` | Settlement Hub | `/driver-finance/settlements` | **Backend only:** pay-run close resolver reads legacy `catalogs.account_role_bindings` (Neon 0 rows) instead of primary `chart_of_accounts_roles` | **New:** `resolveRoleAccount` primary resolver (built, not called by pay-run close) | Cited from `TRUE-CONNECTIVITY-MASTER-2026-07-21.md` §C/§D — **not re-audited here**, still open per that ledger | `DUAL_PATH_OLD_ACTIVE` (money, backend) | `settlement-payrun-close.service.ts:121-140` vs `coa-roles/resolver.service.ts:334` (cited) | citation only — #3149/#3171 |
| `accounting` | Hub, Invoices, Payments, Factoring + `subnav-manifest.ts` full list (Journal Entries, Account Register, All Transactions, Recurring Transactions, Integration Transactions, …) | `/accounting*` | **OLD:** none (unbuilt feature) | **NEW:** none (unbuilt feature) | "Recurring transactions" tab renders `ComingSoonPage` — real stub in a shipped subnav (§1 #8, §2 row 4) | `COMING_SOON_STUB` | `manifest.tsx:3873-3876` | FULL — `DUALPATH-08` |
| `bank` | Overview, Reconcile, Transfers, Fuel Planner, Account Visibility | `/banking*` | **OLD:** Workflow-B (`BankTxCategorizationPage` + `CategorizeDrawer` + 8 forms) — flat categorize page + per-type modal forms. | **NEW:** `BankingTransactionsDesignView` — unified QBO-style register + `MatchDrawer`. | Old Workflow-B fully archived + CI-guarded; only DesignView mounts. | `ARCHIVED_OK` (mitigated) | `verify-banking-workflow-b-archived.mjs`; §3 rows 10-11 | FULL (cited TRUE-CONNECTIVITY-MASTER + this pass) |
| `factoring` | Factoring Hub | `/factoring` | n/a | n/a | No ComingSoon/@deprecated in `pages/factoring/`; live-advance-count gap is a `MISSING_LINK` money finding (TRUE-CONNECTIVITY-MASTER §A "Factor" row), not dual-path | `CLEAN` (dual-path scope) | §2/§3 sweeps | SAMPLED |
| `finance` | Overview, Hub, Projections, Scenarios, Statements, Loan Wizard, Calculator, Amortization | `/finance*` | n/a | n/a | Un-hidden per `sidebar-config.ts:67-71` comment (FIN-2) — Loan Wizard/Calculator/Amortization are flag-gated tabs, not a dual-path (flag-gated ≠ old-vs-new fork) | `CLEAN` | §2/§3 sweeps; code comment | SAMPLED |
| `customers` | List, Sync Panel, COI, COI Requests, Portal Users | `/customers*` | n/a | n/a | `customers/tabs/` has 1 file only (`CoiRequestsTab` per §5's `tabs/` scan) — no parallel-tree signal | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `vendors` | Vendors Home | `/vendors*` | n/a | n/a | No ComingSoon/@deprecated in `pages/vendors/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `inventory` | Parts & Stock, Assignments, Purchase History | `/inventory*` | n/a | n/a | No ComingSoon/@deprecated in `pages/inventory/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `form_425` | 425C | `/425c` | n/a | n/a | No ComingSoon/@deprecated in `pages/form425c/`; has its own `tabs/` dir (5 files), no flat duplicate found | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `lists` | Lists & Catalogs, Names Master, Maintenance Services Catalog | `/lists*` | **OLD:** singular `/lists/driver/{license-classes,…}` (5 flat pages) | **NEW:** plural `/lists/drivers/*` catalog routes | Singular routes `<Navigate>`-redirect to plural (#3190); old files retained test-only. | `ARCHIVED_OK` (#3190) | §3 row "deprecated-subcatalog-pages.tsx" | FULL (#3190 + this pass) |
| `reports` | Reports Home, Trip Profitability, Late Arrival | `/reports*` | see `ProfitabilityPage` orphan (§1 #3) | see `ProfitabilityPage` orphan | `CustomerProfitabilityPage`/`LaneProfitabilityPage`/`TripProfitability` are the only Live profitability surfaces; the more general engine sits unrouted | `ORPHAN_NEW` (cross-ref §4) | §4 | FULL — `DUALPATH-03` |
| `docs` | Docs Home | `/docs*` | n/a | n/a | No ComingSoon/@deprecated in `pages/docs/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `users` | Users, Onboarding, Migration Status, Error Monitor, Launch Readiness, QBO Vendor Linkage, Activity/Audit Log, Audit Trail | `/users*`, `/admin/*` | n/a | n/a | No ComingSoon/@deprecated in `pages/admin/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `help` | Help Center, Overview, Runbooks | `/help*` | n/a | n/a | No ComingSoon/@deprecated in `pages/help/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `program` | Program Tracker | `/program` | n/a | n/a | No ComingSoon/@deprecated in `pages/program/` | `CLEAN` | §2/§3 sweeps | SAMPLED |
| `system` | QBO Reconciliation, QBO Sync, Program Tracker, Build health, Claude Coder | `/system*` | see `QBOSyncStatusDashboardPage` orphan (§1 #5) | `QboSyncDetailPage` at `/qbo/sync-dashboard` | The live QBO sync surface reachable from `system`/`bank` flows is `QboSyncDetailPage`; the ParityTable-migrated `QBOSyncStatusDashboardPage` sits unrouted | `ORPHAN_NEW` (cross-ref §4) | §4 | FULL — `DUALPATH-05` |

**30 rows** (matches `SIDEBAR_ITEM_IDS` array length in `sidebar-config.ts` — the array is the
source of truth per `AGENTS.md`, not a hardcoded "28"). `eld` is included even though hidden
from nav because the owner asked for "across all the software," and it is itself a
self-documented stub worth confirming isn't hiding something worse (it isn't — one line, no
backend, honestly commented).

---

## 6. Known false positives (sampled, labeled per owner instruction)

The mechanical scanner (`scripts/inventory-dual-path-routes.mjs`) does one-hop basename-substring
importer matching, which produces exactly the kind of false positive the owner's honesty clause
anticipates. Two are corrected in §3 above; documented here with the specific defect:

1. **`pages/safety/SafetyHome.tsx`** flagged `MOUNTED_LIVE` because `pages/home/HomePage.tsx`
   imports `"./roles/SafetyHome"` — a *different file* (`pages/home/roles/SafetyHome.tsx`, a
   home-page role widget) whose import path happens to end in the same basename substring
   `SafetyHome`. Confirmed zero live importers of the actual deprecated file.
2. **`pages/safety/components/AccidentReportDrawer.tsx`** flagged `MOUNTED_LIVE` because
   `pages/safety/AccidentsPage.tsx` imports `"../../components/safety/AccidentReportDrawer"` —
   the **new** canonical component, whose path also contains the substring
   `AccidentReportDrawer`. The actual deprecated shim (`pages/safety/components/...`) has zero
   importers; it is a re-export-only stub.

Also documented as a **guard limitation, not a false positive** (§1 #1, §4): the pre-existing
`verify-orphan-components.mjs` reports 0 orphans while 4 real unrouted pages exist, because it
seeds reachability from every `index.ts`/`index.tsx` barrel unconditionally.

Sampling disclosure: modules marked `SAMPLED` (not `FULL`) in §5 were not tab-by-tab walked this
pass; their `CLEAN` verdict rests on the two exhaustive app-wide sweeps (§2, §3) plus a direct
open of their route registration in `manifest.tsx`, not a full behavioral diff against an
earlier design. If Jorge wants `FULL` depth on a specific `SAMPLED` module, name it and it goes
into the next wave.

---

## 7. Secondary ask — Safety ComingSoon fix (already shipped, no new PR needed)

The owner's secondary ask was: *"If Safety ComingSoon stubs still point at stubs while Live
fines/workforce tabs exist after #3183, open a separate fix branch/PR."* Verified against the
current `origin/main` head (`20a717541` — CHROME-14, #3217) that **#3183 already shipped this
exact fix**:

```690:1557:apps/frontend/src/routes/manifest.tsx
<Route path="/safety/fines-and-discipline" element={<Navigate to="/safety/internal-fines" replace />} />
<Route path="/safety/driver-financial-safety" element={<Navigate to="/safety/escrow-record" replace />} />
<Route path="/safety/workforce-planning" element={<Navigate to="/safety/driver-scheduler" replace />} />
```

All three redirect to real, mounted, Live V6.4 tabs (`InternalFinesTab`, `EscrowRecordTab`,
`DriverSchedulerGridPage`). **No `fix/dual-path-safety-comingsoon-redirects-20260722` branch was
opened** — there is nothing left to fix; opening one would just be a no-op diff. This is stated
here as the evidence, not assumed.

---

## 8. Regenerating this audit

```
node scripts/inventory-dual-path-routes.mjs
```

writes `docs/trackers/DUAL-PATH-SCAN-RAW-2026-07-22.md` — the mechanical appendix. Re-run after
any PR that adds/removes `@deprecated`/`@archived` tags or `ComingSoonPage` mounts, then
hand-verify any new `MOUNTED_LIVE` hit before promoting it into this curated doc (do not trust
the raw scan alone — see §6).

CI guard `scripts/verify-dual-path-audit-present.mjs` (wired via
`scripts/verify-steps/1240-verify-dual-path-audit-present.mjs`, Rule 17 pattern) fails the build
if this file goes missing or drops the required `OLD design` / `NEW design` /
`What operators see TODAY` headers.

---

## Spec sources reviewed

- `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 (linkage checklist; dual-path defect
  classes reproduced from `docs/trackers/TRUE-CONNECTIVITY-MASTER-2026-07-21.md` §C)
- `docs/trackers/TRUE-CONNECTIVITY-MASTER-2026-07-21.md` (extended, not replaced)
- `apps/frontend/src/components/layout/sidebar-config.ts` (`SIDEBAR_ITEM_IDS`, flyout routes)
- `apps/frontend/src/routes/manifest.tsx` (full router — opened directly, not assumed)
- `scripts/orphan-components-allowlist.json` / `-baseline.json` / `verify-orphan-components.mjs`
- PRs #3183 (Safety active-path), #3190 (Drivers active-path)

**Approved screens reviewed:** none required — tracker/docs-only audit, no new UI shipped.

**Tab count check:** unchanged — this PR adds no tabs and removes none; §5 confirms the current
sidebar array length (30) against `sidebar-config.ts` without altering it.

**Deviations from spec required:** None.

**NEW SPEC items:** None — this consolidates Rule 21 / TRUE-CONNECTIVITY-MASTER evidence; it does
not invent product tabs or change any locked design.

---

## Update log

| Date | Change |
|---|---|
| 2026-07-22 | Audit opened. 4 ComingSoon mounts (3 intentional fallback/utility, 1 real stub), 21 @deprecated/@archived tagged files (19 mitigated, 2 genuinely live dual-path), 4 orphan pages found via hand-verification of a guard blind spot, 1 route-table duplicate hygiene note, 1 cited money dual-path (settlement CoA resolver, not re-audited). Safety ComingSoon secondary-ask confirmed already fixed by #3183 — no new fix PR opened. |

## UPDATE 2026-07-22 — DUALPATH-06/07 CODE

**PR [#3222](https://github.com/tioperfumes07/IH35-TMS/pull/3222)** (open): Fleet Vehicle + Trailer profiles no longer render deprecated Recent Activity widgets live; `ServiceTimeline` is sole activity surface. Rows #6/#7 / fleet dual-path should flip to `ARCHIVED_OK` after merge + deploy proof.
