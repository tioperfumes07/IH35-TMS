# ROUND 8.5 — independent board parity verification

## Deployed repair acceptance — Legal L3, 11-11 23:15 ET

Factoring follow-up on the same deployed frontend: account-summary begins with the five approved KPI tiles and purchase/terms panels (FA1 ordering gap no longer observed). Aging now exposes Invoice Date/Purchase Date/Fund Date; clicking Invoice then Purchase changes selected state, explanatory caption and date-column header.17rows render. This closes the missing-selector observation only; independent date-source/aging arithmetic and every drill remain UNVERIFIED. No import, terms edit, submission, or money action invoked. CSS1440x900 and private screenshot captured. Whole Factoring board remains OPEN.

Render independently confirms frontend `dep-dbqjngijnfac73bkhh9g` status=live at `772f69a30f48f35a5627e027c0a20d7d3c7ce125` (#28941), finished2026-11-12T04:10:51Z. Fresh Chrome1440x900: Legal Signed pipeline link opens `status=signed_electronically`, Signed checkbox alone is checked, and zero contract rows render. Selecting Draft as a second status and applying yields two draft rows and both repeated status query parameters. Back returns `/legal`. L3 wrong-stage drill CLOSED-LIVE (bounded), including multi-select mechanics and negative control; no contract writes/voids/sends. Full Legal board/modals/financial correctness remain OPEN. Screenshots private inline, no identities or financial records committed.

## Certification coverage correction — Maintenance Settings and census floor

### PM engine finding — source reproduction, no production mutation

Fresh live forward/reverse test: PM list → unit profile works. Unit profile → Open PM schedules preserves `unit_id` in URL but returns96 schedules across multiple units: FAIL. Root cause `PmSchedulePage.tsx:74–75` omits unit from both query key and API call, although the existing API already accepts unit_id. Codex local repair adds both; a rendered route-change test fails old1/3 and passes new3/3, including first unit → second unit → all units with an infinitely fresh cache. Combined owned maintenance tests14/14 PASS. Repair is not deployed or certified live.

Live unit profile also says no PM schedule while its service history reports skipped-no-baseline PM events; its service-map SVG still carries specimen identity. The latter has an existing local TruckProfile repair, not a new duplicate assignment. Do not equate missing baseline with missing schedule or current maintenance. Production writes remain0.

PM Due opens96rows; Create PM Schedule opens the canonical dialog, required-unit Create is disabled, Cancel returns to the same route without a write (bounded PASS). PM type options are Oil/Tires/DOT inspection/Brake/Transmission/Coolant/Other; not proof of approved interval-catalog wiring. Settings still has two unrelated Home history panels in a fresh1440x900 screenshot.

`apps/backend/src/maintenance/pm-schedule.routes.ts:58–63,108–112` classifies missing readings as current and passes last_service_odometer as the nowOdometer input. Actual extracted classifier reproduced locally, exit1: synthetic nextDue125000/lastService100000 → current, nextDue125000/current126000 → overdue; null/null → current. No DB connection or fixture write. This is source-behavior evidence, not a measured count of wrong live schedules. Days/hours have no separate classification in this route. CC-1 must reconcile this reader with the canonical PM engine; the UI must not fabricate status or patch production rows. Process-global env thresholds35–39 do not substantiate the company-configurable caption. PM status acceptance remains FAIL/OPEN.

Fresh source audit: origin/main `81e7dab2c2`; local Maintenance stack `3ce6a27d32`. The design census plain command and selftest both exit0, reporting689 routes and0 failing. This is **not** exhaustive certification: `verify-design-parity-census.mjs:496,499` deliberately returns `routeFail:false` for unresolved page bindings, and line632 counts passing as total minus failures. Do not translate that result into every tab being built or verified. No guard or baseline was weakened or edited.

Maintenance Settings approved source: `docs/design/boards/maintenance/Settings.dc.html`. Current `MaintenanceSettingsPage.tsx` mounts PM Intervals / Vendor Defaults / Bay Assignments / Notifications instead. The following is a source-backed missing-element census, supplementing the earlier live finding, not a new certification register:

| Approved element | Current implementation | Acceptance needed |
|---|---|---|
| PM catalog panel and Add interval | Single default-days input | Canonical interval list and existing create/edit workflow, not copied specimen intervals |
| PM columns Code / Service / Basis / Interval / Warn at / Applies to / Est. cost | No PM catalog table | Seven named columns in order, real values and linked sources; unknown remains unknown |
| Service task catalog | Absent from Settings | Existing `maintenanceServiceTasksCatalogClient` and canonical list workflow; complete pagination, no silent cap |
| Feeds this module depends on | Absent | Canonical feed/job state and last-run evidence; never hard-code the board's sample states |
| Odometer Daily snapshot selector | Absent | Persisted scheduling contract and effective schedule, not a decorative selector |
| Record a gap row checkbox | Absent | Persisted engine setting plus behavior test |
| Allow manual odometer from Driver Reports checkbox | Absent | Persisted permission/engine contract plus behavior test |
| Alerts: PM due soon / overdue escalation | Absent | Canonical thresholds, units, edit/save/read-back tests |
| Alerts: fault severity / shop duration / untouched report duration | Absent | Canonical rules and actual consumers, not UI-only fields |
| Approved two-column panel composition | Four-group legacy form | Replace composition, preserve reachable existing settings without duplicate legacy panels |

API evidence: `api/maintenance.ts:408–435` and backend `maintenance/settings.routes.ts:13–18,100–140` expose only the four legacy settings plus two counts; those endpoints do not establish the approved odometer/alert controls. Service tasks already have an existing client at `api/catalogs-maintenance.ts:84` and a canonical list page; do not duplicate that engine. PM/feeds/threshold canonical ownership must be resolved from existing services before wiring. No production reads or writes were needed for this finding. Settings remains OPEN; all45 remain uncertified until complete per-board evidence is supplied.

## Fresh verification — 2026-11-11 22:16–22:22 ET

### Insurance continuation — bounded read-only certification

CSS1440x900: six approved landing nav labels/order, five KPI labels and three policy timeline rows with Today marker present. Timeline→named policy→Policies and Fleet Covered→named policy clicks PASS; Policies loads3records, Fleet Covered26records. Policy Assigned Units links present. Scheduled+Overdue both checked with Status(2): selection mechanics PASS; filtering semantics UNVERIFIED because no payment rows displayed for that selected policy. Policy Back goes to Policies, not originating Fleet Covered/landing. No financial writes or edit/archive actions. Full visual census, all modals and amount tie-outs remain UNVERIFIED; existing links do not prove #28924 deployed.

New frontend blocker: Render dep-dbqjj6hkph1s739ud85g fails TruckPlanner.tsx316 TS1005; origin/main81e7dab2c2 missing comma after Current Load column315 introduced #28933. Independent TypeScript parser exit1 confirms. Cursor handoff https://github.com/tioperfumes07/IH35-TMS/pull/28933#issuecomment-6814086897. Certification cannot accept undelivered revisions.

### Certification pass — Maintenance In Shop / ShopBays, 22:53 ET

Measured CSS1440x900. PASS controls: In Shop URL retains `status=in-shop`; selected navigation visible; four bay articles render; no Home recent-history panels on In Shop; Check a truck in opens `/maintenance/arriving-soon`; In Shop link returns to all four bays. The arrival page has an explicit empty queue; no check-in, bay move, work-order create or other write was invoked. Occupied-bay status/progress/release and source correctness remain UNVERIFIED against real populated records; empty UI is not evidence that the backend population is truly zero. Full boards23/45 remain OPEN, not certified. Arrival page still mounts Home history panels; owned isolation repair remains local pending release gates. Screenshot private in audit chat.

Certification dispatch delivered to Cursor/Lead with required per-board proof fields: https://github.com/tioperfumes07/IH35-TMS/pull/28932#issuecomment-6813891026. CC-1 coder directly notified for Legal void-route and same-company FK gates. Frontend #28924 deploy failed; #28929 building/#28932 queued at last check, so no new deployed acceptance.

### Customers continuation — read-only 1440x900

Bounded PASS: nine overview column labels/order, six KPI labels, five chips, Factored chip reduces91→38 records, customer detail and canonical create form open. FAIL C-return: detail Back drops `chip=factored` and returns91 records (`CustomerDetail.tsx:1045`). FAIL C-create-return: opening then closing Create Customer leaves `/customers?view=detail` and the legacy master-detail page instead of the originating approved board. `routes/manifest.tsx:53` sets detail+create; `Customers.tsx:650` clears only create; `PartyBoard.tsx:232` retains legacy page. Preserve originating board/query state and add behavioral round-trip tests. No form fields typed, no Save, no production mutation. Full customer subtabs and financial correctness remain UNVERIFIED.

### Cash Flow continuation — 22:40 ET

Vendor create-return also FAILS: approved board30rows → Create Vendor → Close leaves `/vendors?view=detail`, legacy master-detail page with zero displayed transaction rows. `Vendors.tsx:242` clears only create; shared manifest forces detail. No submission. Reference six KPI labels, category/payment panels and seven named vendor columns are present, but full reverse wiring remains OPEN. Private screenshot captured. Customer/Vendor shared handoff: https://github.com/tioperfumes07/IH35-TMS/pull/28900#issuecomment-6813800079.

Further bounded Vendor PASS: Open bills chip changes30→21 records; vendor detail→open bill row opens its bill; bill Vendor link returns to the same vendor. Row click works despite no anchor, so not a dead-link finding. FAIL: vendor Back returns `/vendors` and30rows, losing `chip=open_bills` (`VendorDetail.tsx:467`). Bill-row keyboard semantics remain unverified; mouse success is not keyboard proof. No financial buttons clicked.

Cash Flow Home net matrix drill opens the selected week in Rolling Ledger and Home navigation returns correctly: bounded navigation PASS. Full amount-drill FAIL: Home includes run-rate forecast components, while the destination displays due documents and no bridge from the clicked forecast net. This is a missing explanatory/source drill, not proof of a wrong posted ledger. Preserve scenario, bucket, opening cash and forecast assumptions in the drill before certification. Source `CashFlowHomeTab.tsx:546,631`; [Cursor handoff](https://github.com/tioperfumes07/IH35-TMS/pull/28907#issuecomment-6813717730). Private screenshot, no production mutation.

Read-only USMCA Chrome, actual CSS viewport1440x900. No saves, voids, payments, imports or production data changes. Screenshots retained privately in the audit chat; no personal or financial screenshots committed.

| Surface / check | Result | Evidence and limit |
|---|---|---|
| Settlements home → Closed records | PASS, bounded | Six records render; not proof of all balances or full board parity |
| Closed record → statement → Back | PASS, bounded | Statement loads; Driver Settlements Back returns to /driver-finance/settlements |
| Settlement statement identity / earnings drill | FAIL | Driver settlement header shows blank display; loaded/empty earnings rows show blank driver-bill links, mileage and rates. Source contracts need investigation; not authority to alter money |
| Statement linked Advances recovered | FAIL | Label uses general recoveries_cents, including an observed admin-fee deduction, and MoneyCell self-links to the statement rather than the source advance; SettlementStatementLinkedRecordsPanel.tsx:67,119–127 |
| Document Designs (#28895) | NOT LIVE | Direct route redirects Home; absent from rendered Settlements navigation. Static specimen iframe is a reference surface, not evidence that generated production statements match designs |
| Factoring Aging date basis (#28896) | NOT LIVE | Invoice/Purchase/Fund Date control absent; deployed page explicitly says toggle not wired |
| Legal Signed stage (#28887) | FAIL LIVE / repair pending deployment | Signed links to unfiltered /legal/contracts and renders two draft rows |

Cursor handoff: [fresh live evidence](https://github.com/tioperfumes07/IH35-TMS/pull/28900#issuecomment-6813413090), [Legal reproduction](https://github.com/tioperfumes07/IH35-TMS/pull/28900#issuecomment-6813435683). Current source merges are not frontend deployment proof. No complete board certification is implied by the bounded navigation passes above.

## Status — 2026-11-09, first live batch

**NOT COMPLETE. No board is certified exact or fully wired.** Three home boards have initial live visual evidence; remaining boards and exhaustive element counts are UNVERIFIED. A static label census is not visual or functional acceptance.

### Maintenance continuation — 2026-11-09 evening

Fourth home board inspected live at measured 1440×900 CSS pixels. Screenshot: private `~/Downloads/codex-round8-5-design-parity/Maintenance-Home-live.jpg`. Four additional distinct findings (confirmed total 16, repaired 0); exhaustive census and interaction verification still pending.

| ID | Approved board | Live observation | Repair target |
|---|---|---|---|
| M1 | Fleet-health filters All / Moving / PM soon / No clock | Moving absent; only three filters rendered | `FleetHealthLine.tsx:60`: add real canonical moving predicate; never infer/mock missing telemetry |
| M2 | Truck graphic beside unit identity in a wide row cell | Graphic below unit number; make/model clipped in narrow unit column | `FleetHealthLine.tsx:49`: horizontal identity grouping with sufficient column width |
| M3 | Readable unit identity and status | 50 cells have scrollWidth greater than clientWidth across the first 25 fleet rows at 1440px | `FleetHealthLine.tsx:48–57`, shared table width contract; preserve complete values and actions |
| M4 | Compact fleet overview, arrivals and risk panels below it | Arrivals/risk table headers at viewport y2937; recent/completed work orders y3221 | `FleetHealthLine.tsx:62`: bounded overview with complete reachable fleet list, no silent data cap |

The live overview reports 39 units and displays 25 on the current page. Population changes versus the old board are not design failures. Missing PM bars when readings are unavailable are not permission to insert the board's sample readings. Five monitor cards, four KPI labels and six fleet table headers are present; their entire wiring is NOT yet certified.

### Maintenance In Shop — M5 repair in progress

Following the actual In Shop link opens `/maintenance/fleet-table?status=in-shop`, with four open bays. However Fleet Table has `aria-current="page"` and In Shop has no current marker; breadcrumb also says Fleet Table. Approved board identifies In Shop. Root cause for active-tab mismatch: shared `mostSpecificActiveTo` compared pathname against links containing query strings, so query-specific tabs could never match. Codex repair passes pathname plus search, preferring matching query constraints over the same bare path. Three new rendered tests fail on old code; 18 navigation tests pass on repaired code. Breadcrumb remains separately OPEN. No sample work orders created to fill empty bays. Private screenshot: `~/Downloads/codex-round8-5-design-parity/Maintenance-InShop-live.jpg`. Post-deploy visual verification pending; not DONE-LIVE.

**M5 active-tab portion VERIFIED LIVE 2026-11-09 ~20:51 CT:** #28726 / `30fa65871deeba05ab86e0d28b95da26b015b376`. In Shop now current=page, Fleet Table current=null; four bays render. Private after screenshot `Maintenance-InShop-active-fixed-live.jpg`. Breadcrumb still Fleet Table: not closed. No claim of entire In Shop board parity.

### Fuel / Settlements / Factoring continuation — 2026-11-09 ~20:52–20:55 CT

All measurements below are CSS 1440×900. Private files: `Fuel-live.jpg`, `Settlements-live.jpg`, `Factoring-live.jpg` in the existing Downloads evidence folder. Reference values/population counts are not fixtures to insert. No production mutation performed.

| ID | Board target | Measured live gap | Target for Cursor |
|---|---|---|---|
| F1 | Fuel truck graphic + make/model identity | Six-column plain table, no truck illustration/model row | FuelHome and FuelDieselByTruckPanel: reuse real unit graphic/identity; no fabricated make/model |
| F2 | Fuel spend bar plus separate dollar column | Spend only a numeric cell; proportional spend bar absent | Restore board bar using the same aggregate values, keep real dollar amount readable |
| F3 | Fuel selected month agrees with displayed period | Selected label Oct while KPI period says Nov 1–9 | fuelBoardPeriod.ts: static Oct/Sep labels, range is current/previous month; make labels truthful without changing accounting |
| T1 | Settlements compact one-line module strip | Measured menubar 59.35px, labels wrap; right-side tabs overflow first view | Shared navigation compact overflow while preserving all tabs |
| T2 | Settlements chart has monetary Y-axis | SVG has 11 week labels, no monetary-axis labels | SettlementsHomeBoardPanels.tsx chart axis and geometry |
| T3 | Every settlement load resolves through EntityLink | Closed toggle shows 14 driver links, 0 links to /dispatch/loads/ | Weekly row load identities need real load-id links; preserve driver links |
| FA1 | Factoring KPI strip precedes purchase/terms panels | Account-summary starts with Invoice Status; approved board begins at y1479, chart/terms y1569 | FactoringHome.tsx:1570/1998: render approved summary first, preserve invoice report below/in its reachable section |

Wiring observed: Settlements Closed toggle changes empty open list to 14 records; this is not proof of all money or semantic correctness. Factoring Account summary navigation opens `/factoring/account-summary`; board exists but is displaced by the earlier report. Shared header after latest reload measures 41.99px (previously103.21); width/overflow and all other shell elements not yet accepted. No entire board certified exact.

Reference: owner's `11-09-2026-IH35-ALL-PAGE-DESIGNS` export, approved V3 renders and `.dc.html`, and `docs/bus/lead/11-09-2026-CODEX-ROUND-8.5-Design-Parity-Verify-All-Boards.md`. Exclude old LoadWizard, V2 and PREVIOUS boards. Keep legitimate additive functionality; do not delete columns or data to imitate a screenshot.

Browser: authenticated USMCA, Chrome, measured `innerWidth=1440`, `innerHeight=900`. Browser zoom was 80%; a requested 1440×900 override initially produced 1800×1125 CSS pixels. Corrected using a 1152×720 override and verified actual CSS dimensions before grading. Screenshots may have a different physical pixel scale; raw pixel differences are NOT yet normalized or scored. Banking/Accounting inspected after the new-version Reload. Private screenshots are under `~/Downloads/codex-round8-5-design-parity/`; do not commit production personal/financial data.

| Board | Visual result | Exhaustive element total/pass/fail | Functional proof |
|---|---|---|---|
| Insurance | FAIL: I1–I5 below, plus shared S1/S2 | UNVERIFIED; not a completed census | Policy year View all opens Policies, 3 loaded rows, no mutation |
| Banking | FAIL: B1–B3 below, plus shared S1/S2 | UNVERIFIED; not a completed census | Navigation and data rendering only; actions NOT certified |
| Accounting | FAIL: A1/A2 below, plus shared S1 | UNVERIFIED; not a completed census | Navigation and data rendering only; actions NOT certified |
| Other approved boards | UNVERIFIED | UNVERIFIED | No fresh Round 8.5 claim |

## Confirmed differences for Cursor ROUND 8.4

| ID | Board expectation | Observed live result | Rendering source / acceptance |
|---|---|---|---|
| S1 | Top header 42px; narrow 66px navigation rail; compact single-line top bar | Banking header measured 103.21 CSS px, account menu wraps; rail visibly wider. Main content displaced downward/right | Shared shell/header/sidebar. Match board geometry at actual 1440 CSS width without deleting controls; preserve usability at smaller widths |
| S2 | Inter heading | Insurance and Banking H1 computed `600 22px / 33px Source Serif Pro, Charter, Georgia, serif` | `apps/frontend/src/components/layout/PageHeader.tsx:87` explicitly selects `typography.fontSerif`. Shared token/approved-board conflict must be resolved consistently, not per-page font overrides |
| I1 | Policy labels left of timeline; bars and amounts on same row | Labels and amounts above each full-width bar | `apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx:324`; column-oriented row structure. Preserve live policy/carrier links, align label + timeline in columns |
| I2 | One red dashed Today line across all policy rows, caption aligned to line | Separate green markers in each row; gray caption below chart | `InsuranceHomeBoard.tsx:363–380`; implement the board's shared time-axis marker using real dates |
| I3 | Full premium values, single-line total | Premium cells truncate and total wraps into two lines at 1440 CSS px | `InsuranceHomeBoard.tsx:397–424` and shared ParityTable sizing; minimum money width, no ellipsis on amounts |
| I4 | Fleet Covered explanatory footer inside Premium by coverage panel | Note sits below both panels | `InsuranceHomeBoard.tsx:427`; move note into panel footer while preserving its link |
| I5 | Header subtitle `Policies · fleet covered · claims · coverage gaps` | `Policies, fleet coverage, claims, and lawsuits` | Insurance layout/header subtitle: match the approved text; do not remove Legal workflows |
| B1 | Reconciliation Bank/Book/Diff values fully visible | DOM measured 10 ellipsized cells in the 15-row reconciliation table | `apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx:720–763`, shared column widths; monetary cells must remain readable |
| B2 | Latest lines immediately below the two summary panels | Latest lines table begins at y=2196 CSS px; initial view omits it. 15 drift rows and 33 pending rows expand preceding content | `BankingHomeBoard.tsx:693–814`; restore bounded summary-panel layout and keep full lists reachable. Do not silently cap or discard pending transactions |
| B3 | Account body labels left-aligned | Accounts table body labels centered | `BankingHomeBoard.tsx` account column plus ParityTable board appearance. Preserve centered sortable headers if separately required; body alignment must match board |
| A1 | Accounting subnav is one compact row | Navigation wraps to two rows at 1440 CSS px | Accounting navigation includes additional counts/amounts and labels; preserve actions but restore compact layout/overflow behavior |
| A2 | Lower panels use asymmetric widths (Receivables/Cash wider than Settlements) | All three measured 425 CSS px wide | `apps/frontend/src/pages/accounting/AccountingHubPage.tsx:631–818`; adopt reference proportions rather than three equal columns |

Data values, current month, policy elapsed days and real row populations differ legitimately from the October mockup. They are not evidence of a defect by themselves. Added table settings, sort controls, real coverage values and the Expires column are not to be removed merely for pixel equality. Confirmed screenshot differences do not establish wrong ledger balances.

## Reference integrity observations

Repo root has 43 unprefixed `.dc.html` files, not automatically 43 approved canvas-1 boards. The manifest's approved V3 set contains 42 after excluding the three old LoadWizard boards; only 22 literally include `IN THE LIVE APP` in their title, with the other approved entries labeled SETTLEMENTS MODULE / DISPATCH / NEW V3. Do not filter approval by that phrase alone.

Initial comparison of the 43 unprefixed files with the export: 6 exact; 30 equal after normalizing title/user-label and trailing whitespace; 6 settlement boards differ further; Modal-FuelAssignment has no corresponding file in this canvas export. The first difference in each of those six settlement boards is a sort-indicator span present in the export and absent in the repo. Full difference classification is pending; do not describe all files as identical except title.

## Remaining acceptance work

### Safety / Cash Flow / Reports continuation — 2026-11-09 21:06–21:25 CT

Read-only USMCA at measured CSS viewport 1440×900. Private screenshots remain under Downloads/codex-round8-5-design-parity; no production financial screenshots committed. These are measured partial comparisons, not whole-board acceptance or accounting tie-outs.

| ID | Board | Expected | Observed / required repair |
|---|---|---|---|
| SF1 | Safety-DriverFiles | Compact navy navigation below title/subtitle | White oversized two-band header, duplicate breadcrumb, subtitle pushed right; qualification table header y404.63 versus reference y274 |
| SF2 | Safety-DriverFiles | Left-aligned driver/status cells with colored status dots | Body centered; dots absent; 11 real rows, 77 links, zero clipped cells. Do not invent historical dates/statuses |
| CF1 | All five Cash Flow boards | Related links above tab strip | Related links below strip, reversing reference order |
| CF2 | CashFlow-Home | Source drill from cash-flow cells | 26 weekly Net cash flow/Ending balance cells lack semantic controls; other metric cells have buttons. Source/interaction confirmation still needed before declaring dead |
| CF3 | CashFlow-Projected | Seven separate day tiles with gaps | Joined seven-day strip plus extra heading |
| CF4 | CashFlow-ActualVsProjected | KPI titles inside tiles; readable chart axis | Titles above tile top; chart left x82.62, four money-axis labels start x73–76 and clip; by-date table y895.41 versus reference y685 |
| CF5 | CashFlow-RollingLedger | Readable party/document columns | Income 1 clipped cell, expenses 4 clipped cells. Preserve additional columns/actions while restoring proportions; carried tables y1059.71, day grid y1334.24 |
| CF6 | CashFlow-Manual | Empty tables retain headings and priority groups | Two blank panels without column headers or six expense headings; duplicated Measured label |
| R1 | Reports and report viewers | Title before navy navigation | Reports nav y90.61 precedes title y138.59; Trial Balance nav y66.61 precedes title y134.59. Loads and settlement reports also add a second five-link strip |
| R2 | Reports-Viewer-TrialBalance | Compact account table; left-aligned labels | Table starts y419.30 vs reference y356; centered account/type body. Five header names/order match, 52 rows and 208 semantic links observed; Collapse works |
| R3 | Reports-Loads | Empty miles KPI; Empty mi / Empty % columns; revenue-by-week chart | Empty-mile KPI replaced by Margin; both empty-mile columns absent; no revenue chart heading or chart in loaded view. Preserve Fuel/Margin additions, do not substitute fabricated empty miles |
| R4 | Reports-Loads / Reports-DriverSettlements | Fully readable values and names | Loads 15 clipped table cells; Driver report 27 clipped cells among 25 rendered rows. Driver report all 13 column names/order match reference |
| R5 | Reports-Customers | Date range controls, Loads/Avg per load and advanced-Faro amount | Only YTD/Last 12 months/All time presets; Invoices/Avg per invoice replace load metrics; customer-count tile replaces advanced amount; Factored column is factor label rather than amount. Requires canonical data, not relabeling invoice counts as loads |
| R6 | Reports-Vendors | Explicit dates, Truck filter, Card payables tile | Only YTD/Last 12 months/All time presets; Truck absent; 1099-count tile replaces Card payables. Nine columns/25 rendered rows, zero clipped cells; preserve Pays through and transaction links |

Functional proof: Cash Flow Monthly changes 13 weekly columns to four months. Projected shows all six priority categories and customer/load links. Actual vs Projected loaded chart/four KPIs/eight rows. Loads Month changes 15 weekly rows to five monthly groups. Company report loaded 12 columns (added Number preserved), 25 rendered rows, zero clipped cells; exhaustive group/drill checks pending. Customer report loaded 10 columns, 25 rendered rows, zero clipped cells. No Save, Pull, Create, Roll over or financial submission used. No numerical ledger correctness inferred from these UI observations.

Fuel F3 code merged #28740 at 373dd9fdc026410cfebd55f55077562b6c7b66e6. Final workspace TypeScript build and Fuel tests 14/14 passed; affected guard comparison has zero regressions. Both concurrent TSX repairs independently landed on main (#28743/#28745). Repaired deployed labels remain UNVERIFIED, not an accepted Fuel board.

M5 navigation recheck after hard reload, 21:26 CT: breadcrumb now `Maintenance›In Shop`; only In Shop has `aria-current=page`; all four open bay articles loaded. Navigation defect CLOSED-LIVE, not full In Shop/ShopBays acceptance. Private screenshot Maintenance-InShop-breadcrumb-fixed-live.jpg. Maintenance Home Moving filter is now present; movement population/behavior still needs separate proof.

### Customers / Vendors / Legal continuation — 2026-11-09 ~21:00–21:05 CT

CSS viewport 1440×900. Private evidence: Customers-live.jpg, Vendors-live.jpg, Legal-live.jpg in the same Downloads folder. No production submissions.

| ID | Board expectation | Measured live result | Required repair |
|---|---|---|---|
| C1 | One Customers breadcrumb above the heading | Outer breadcrumb plus another Customers label before Back/title | Remove redundant chrome without removing navigation |
| V1 | Compact Pays through panel and vendor overview below | Four-account summary table starts y343; vendor table starts y641; approved vendor section starts approximately y428 | Compact summary controls/spacing, preserve settings and full data access |
| V2 | Vendor board columns visible in the overview | Suggested category/action column expands table; Last paid/Pays through require horizontal scrolling | Preserve suggestions in reachable detail/secondary layout while restoring approved overview geometry |
| L1 | Legal pipeline colored stage markers | Five live stages have plain labels with no status dots | Restore stage markers without inventing status data |
| L2 | Matters empty state retains Matter / Next date / At risk headings | Empty panel shows explanatory paragraph only | Retain board table header/empty-state structure |
| L3 | Pipeline drill accessible as a link/control | Five clickable rows, zero anchors/buttons and no tabindex/role; mouse Draft click opens /legal/contracts | Preserve existing drill and add keyboard-accessible semantic links; not a dead-button finding |

Customers has nine correctly ordered overview column labels and 90 rendered records; exhaustive wiring remains unverified. Vendors has thirty current records and zero measured clipped cells, but rightmost columns extend outside the initial view. Current populations are not required to equal historical sample counts. Legal Create Contract opens the five-stage Send Contract wizard with a template picker; Cancel closes it without saving. Draft mouse-row navigation succeeds; lack of anchors alone does not prove broken navigation.

### F3 bounded Codex repair

Static October/September captions were applied to dynamic current/previous month queries. Shared period-option generation now derives captions from the same business-date range, preserves legacy period keys, uses canonical Central company date, and includes the missing YTD ending month. Old YTD behavior fails the new test (Jan 1–9 instead of Jan 1 – Nov 9). Repaired period and existing Fuel tests: 14/14. Live deployment acceptance remains pending; no accounting writes or data changes.

### Dispatch continuation — 2026-11-09 21:35 CT

### Driver Profile continuation — 2026-11-09 21:39 CT

### Settlements continuation — 2026-11-09 21:42 CT

T1 single-line nav repair verified: height26.98px (formerly59.35), horizontal content2341px within1342px viewport. T2 money axis now contains five formatted currency labels. T3 selected closed-week panel now provides16 load links alongside driver links. These bounded defects are CLOSED-LIVE, not whole-board acceptance. New T4: selected `Settlement (Closed)` panel renders16 rows labeled `Open`; underlying business-state mapping requires source/engine review, not automatic reclassification. Screenshot Settlements-chart-links-recheck-live.jpg.

T5 Open board: four loaded rows,22 columns/2571px table, eight clipped cells. Reference groups tour legs into one column and places Driver/Unit immediately after Settlement; live splits load legs across columns before Driver/Unit, then adds counts/check columns. Preserve extra data via accessible secondary/detail presentation while restoring the approved overview. T6 Closed board:22columns/2453px,25 rendered rows/25clipped cells; same ordering/expansion mismatch. Readiness prose still says six checks while loaded Open rows show eight required; update prose to canonical checklist rather than reduce checks. Private Settlements-Open-live.jpg and Settlements-Closed-live.jpg. No Verify & Post or financial action invoked.

DP1: all eleven approved tab labels/order exist, plus an additive More menu, but live strip is white with underline rather than navy. DP2: top unit/pay panels are equal height; reference pay panel is compact. Pay heading reads Open pre-settlement, not Pay this week; population/time-window equivalence is not inferred. DP3: trip table uses separate Pickup/Delivery columns and expanded shared controls, with Booked rate outside initial panel width; one lane cell clips. Both trip/document headers are y532.11 versus reference y405. DP4: document status dots absent; non-blocking explanation is present. Actual recorded data must not be replaced by reference example values or unsupported Valid labels.

Private DriverProfile-live.jpg. Live unit link, speed link with explicit last-reported disclaimer, settlement/load links, HOS detail/Edit controls and five document rows are present. Current location unavailable is accurately disclosed. Exact payment correctness, all tab contents and reverse links remain unverified. No edit or submission performed.

**D5 BLOCKING, canonical Load History:** `/dispatch/load-history` loads its header/filter/table structure, then HTTP500 `missing FROM-clause entry for table "lc"`. The table simultaneously says no matching loads and totals zero; these are not measured zero populations. Root source: `apps/backend/src/reports/loads-history.service.ts:314-317` totals refer to `lc.lc_revenue_cents` and siblings while its join at line328 produces alias `lcr`, with unprefixed fields (`load-cost-rollup.sql.ts:100,112-119`). Owning backend seat must fix this read query with an execution-level SQL regression; no ledger changes required. Private evidence Dispatch-LoadHistory-sql-error-live.jpg. All row/drill/aggregate acceptance remains UNVERIFIED until query succeeds.

**D6 navigation divergence:** Dispatch's top `Loads history` button opens `/dispatch?board_scope=history&view=list&date_mode=delivery...` (legacy live-load table, 50 of51 rows in observed date range). Its `Load history` menu opens `/dispatch/load-history`, the dedicated approved board. Preserve existing views but make the canonical history destination unambiguous. Do not score the legacy table as the approved board.

Read-only USMCA, CSS viewport 1440×900. This is a partial element comparison, not board acceptance. Screenshots are private in Downloads/codex-round8-5-design-parity.

| ID | Board | Reference | Live observation / repair |
|---|---|---|---|
| D1 | Dispatch-BookLoad-Modal | Left A–E section/navigation rail beside the form | Center mode has two A/B form columns but no left section rail; preserve all extra workflow fields while restoring board structure |
| D2 | Dispatch-BookLoad-Modal | Four charge amounts side by side | Charges render as a vertical four-row table; preserve calculations and engine wiring |
| D3 | Dispatch-TruckPlanner | Filter popover includes Status and Driver selectors, with entity-filter heading | Loaded Filters contains only period, date range, duplicate range presets, and weekday toggles; no status or driver control. DispatchPlannersLayout.tsx PlannerControls only supplies range/show-days to UniversalFilterBar |
| D4 | Dispatch-TruckPlanner | Visible Driver header and detailed truck graphic beside Unit | Timeline has driver values and resize separator but no Driver heading in accessibility tree; live uses small outline truck glyph, not the approved detailed graphic. Preserve extra Status/Action columns |

Planner Grid→List works: 16 real unit rows, five sortable/resizable columns, linked units/drivers and current-load link. This does not prove all planner filters or every load bar. No missing mileage was invented. Book Load Center/Side panel toggle and NB/TR cards respond; NB displays required port selector, TR replaces it with tour-join explanation. AlwaysTrack→reference→type-it source path is present. Load-number input measured 31.992px high and 110px wide. No book/save/dispatch submitted; only our unsaved local selections were discarded. Modal semantics (zero role=dialog observed) require source confirmation before repair. Side-panel and specification boards remain partially inspected.

Evidence: Dispatch-BookLoad-Modal-live.jpg, Dispatch-BookLoad-TripType-live.jpg, Dispatch-BookLoad-SidePanel-live.jpg, Dispatch-TruckPlanner-live.jpg, Dispatch-TruckPlanner-filters-live.jpg. Raw screenshots contain private production data and are not committed.

F3 live caption recheck: Fuel shows current/previous month names Nov/Oct; selecting YTD shows Jan 1–Nov 9. Caption defect CLOSED-LIVE; full Fuel board and accounting tie-out remain open. Evidence Fuel-period-YTD-fixed-live.jpg.

Round 8.5a Factoring repair merged #28747 at cc904ea4ded8357090eedc43fe5f528813f12911: original 34 tests plus two route-authority regressions pass (36/36), frontend noEmit TypeScript exit0, 74 affected guards with zero regressions. Four inherited failures were reported, not relabeled green. Deployment/live Factoring recheck remains pending.

Complete the 45-board route/trigger map, reviewed element census, all live interactions safe to exercise without production writes, same-scale board/live/diff artifacts with privacy protection, and the claimed/registered fail-closed guard. Missing evidence must remain UNVERIFIED and block completion.
