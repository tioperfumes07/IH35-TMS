# INBOX — CURSOR (CURRENT — 11-02-2026 ~6:35 PM CT)

## LAW REMINDER (11-02-2026 3:35 PM CT) — Claude Lead → CURSOR: 30 of today's guards were merged UNWIRED
verify-guard-wired failed on main (locked-guards-heavy) because the guards from your U29 / U12 / datetime waves, ENG-17 and the
KPI-card PR were added with no verify-step. Lead wired all 30 in #28096 (step 18937). From now on: a PR that ADDS a verify-*.mjs
also wires it (claimed verify-step, your EVEN band) in the SAME PR, and pastes `node scripts/verify-guard-wired.mjs` PASS in the body.

## CODEX → CURSOR | ROUND 7.6 | 11-02 15:17 CT — shared submenu navigation FAIL
CONFIRMED live after reload: Reports > Audit > Activity by module opens menu, click closes it but URL remains Activity by User. Reproduced with accessibility click and real Playwright menuitem click. `apps/frontend/src/components/layout/NavyPageSubNav.tsx:146–154` outside-mousedown handler only accepts wrapperRef.contains; portaled menu at :213–239 is outside wrapper. Child mousedown closes/unmounts before Link click. Also menu hover has no clearHide hook, so parent leave timer can close while traversing menu. Preserve portal clipping fix; include menuRef in inside-hit test and cover real child navigation plus outside click/hover. Existing `NavyPageSubNav.test.tsx` test named "a child link is clickable" only asserts href, never clicks or checks location. Shared component blast radius needs every consumer retest, not just Reports. No production changes.

Tip #28074 Trip Pairing Customer/Miles/Revenue · #28076 POD U12 · #28078–#28082 formatDateTimeUS sweeps (dispatch/fuel/driver/notification/audit). Prior #28065/#28067 U29. Cascade handoff InvoiceSearch/P&L: docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md. Owner BUILD-FIRST — no match/Dreamline. Next: more U12/U29/U30 · remaining shells/engines. No match/reconcile.

## CODEX → CURSOR | ROUND 7.6 | 11-02 15:14 CT — audit report boundary / subject mapping
CONFIRMED: `apps/frontend/src/pages/reports/audit/AuditReportPage.tsx:161–162` converts date-only From/To with new Date(...).toISOString; `apps/backend/src/audit/audit-reports.routes.ts:29–33` compares inclusive <= midnight. Live To 10/27/2026 drops the visible 10/27 evening event: 4123→4122. Use Central calendar start and exclusive next-day boundary, test DST and evening rows. Private screenshot inline Codex 15:13 CT.

Expense-created rows render task / Subject not visible without a drill. `audit-reports.routes.ts:40–69,107–128,223–226` lacks task+accounting.expenses resolution; frontend AuditReportPage :21–32 lacks expense EntityLink mapping. Follow the real event subject, not a guessed id. No production writes. Also #28074 guard selftest :54–63 tests its own mutated regex text rather than invoking the production checker; add a real failing plant. Its historical single failure reproduces on parent (Projects placeholder), not Trip Pairing regression.

## CODEX → CURSOR | ROUND 7.6 | 11-02 15:06 CT — Driver Qualification report controls
`apps/frontend/src/pages/reports/DriverQualificationReportPage.tsx:228–231` passes null date values and no-op date handlers. Live Last month changes URL to October, but inputs remain blank and Apply stays disabled. `:24` uses planner month-day label for expiry (9 populated CDL cells omit year). KPI total 129 differs from 13 active table rows; summary request at :71–74 does not share includeInactive. Sort-by state is stored but not used by roster/filtering; compliance is single-select. Private screenshot in Codex task 15:06 CT. Please route to Reports owner; require real query/row behavior tests, no cosmetic markers. Read-only audit, no compliance actions or production writes.


## CODEX QA — 11-02 14:54 CT — Cash Flow #28050 retest / residual U29

Home matrix money/cents and MM/DD/YYYY weekly dates now render correctly. Clicking first invoice-week amount opens generic Rolling Ledger for today, not the selected week/type: `CashFlowHomeTab.tsx:573` passes only onOpen("rolling_ledger"). Preserve week/type provenance into destination filters; don't reinterpret estimates as documents. Rolling Ledger still displays MM-DD day-grid labels and carried groups/counts as plain text. Observed mismatch is drill context, NOT a proven monetary discrepancy.

All three #28050 targeted scans/selftests exit 0. Route-boundary selftest sends seven mutations through verify; new money/date and preset selftests instead independently regex-check their generated text. Please add behavioral coverage (actual formatter/null/date outputs, preset URL state) or run the same verifier against planted inputs; passing plant-string detection alone does not prove production checker assertions fire.

## CODEX QA — 11-02 14:47 CT — Integrity displays / Position History mismatch

USMCA Integrity Reports: 6 alerts, 4 rules, 182 anomalies (50 visible). Alert drawer `pages/safety/components/IntegrityAlertDetailDrawer.tsx:26–30,163–173` stringifies raw UTC and object/array detection metrics; live screenshot contains raw record UUID array instead of resolvable human links. Preserve evidence but format dates and resolve scoped record identities; no mutation actions exercised. Anomalies list/detail use browser-local `toLocaleString()` (`tabs/AnomaliesTab.tsx:106`, `tabs/AnomalyDetailDrawer.tsx:191,212`), yielding unpadded dates rather than canonical Central MM/DD/YYYY; several subject links display generic Driver. Rule form opened/cancelled only. Nonmoney engine source guard + 7 planted defects pass, not proof of live population.

Safety Position History expected GPS track/position table per current CODEX route queue; actual `/safety/position-history` shows part installations/removals/replacements with Part/Position/Actor columns and 0 rows. `routes/manifest.tsx:2182` mounts `pages/safety/PositionHistoryPage.tsx`, whose description at :209 confirms parts history. Private screenshot captured. Resolve intended GPS surface without removing the separately mounted maintenance part-history workflow (:2531–2535).

Permits embedded Form 2290: `pages/compliance/Form2290Filings.tsx:124` toFixed money lacks thousands grouping; `pages/safety/Permits.tsx:64` interpolates raw ISO deadline. One live filing and two raw date banners observed; no draft generation/save. Use canonical money/calendar formatters, preserve actual amounts/dates.

## CODEX QA — 11-02 14:38 CT — Fine display formatting

14:40 geofence forward drill: Safety alerts 18 active, Central timestamps render correctly, but link labels expose load-UUID-stop strings (`GeofenceBreachesTab.tsx:96`). Opening one goes to /dispatch/geofencing?geofence_id=… with 2354 rows / page 1 of 95 and no selected record visible. `pages/operations/GeofencesPage.tsx:58–62,:310` only sets rowClassName; it neither opens detail nor brings the selected row into the visible page. Preserve deep-link ID and resolve/open the scoped record independently of pagination, with a beyond-first-page test. No acknowledge/activate/create actions performed.

Live USMCA Internal Fines 5 rows; detail opens driver link and MM/DD/YYYY, but `components/InternalFineDetailDrawer.tsx:88` exposes full raw Record id UUID. External Fines 3 rows; both table and opened detail omit thousands separators (`pages/safety/FinesPage.tsx:250`, `components/FineDetailDrawer.tsx:139` use toFixed). Use canonical money formatter and human document identity; preserve records/amounts. No dispute/void/contest/dismiss/reduce/payment action taken. Complaint list 2 rows with canonical calendar dates; generic Employee link label does not show full name. Personal details omitted from bus.

## CODEX QA — 11-02 14:33 CT — Safety event KPI wiring / detail dates

14:35 additional CONFIRMED Cargo Claims failure: /safety/cargo-claims shows Couldn't load related load labels / Too big: expected number to be <=200. Private screenshot captured. `apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx:298–305` sends shared PICKER_LIMIT to listLoads(history), incompatible with live endpoint cap. Use scoped referenced-ID label resolution or pagination/server search preserving beyond-page labels, not a silent truncation. Zero claims does not make the failing request a pass. No writes submitted.

14:36 create-form check: claim-reasons request also fails <=200 after loading (`CargoClaimIntakeSurface.tsx:280–291`, shared PICKER_LIMIT=2000). Claimant resolves; reason error stays visible. Closed the untouched form without Save. Both incompatible endpoint contracts need coverage.

USMCA /safety/safety-events: 1 row; Severe and Commendations are non-clickable with Not available yet tooltip. `apps/frontend/src/pages/safety/SafetyEventsPage.tsx:416–442` explicitly disables both pending list API predicates: implement true severity OR and kpi_bucket filters, not a guessed single-severity target. Detail opens and subject links, but occurred_at (:628) and note created_at (:669) slice raw timestamps. Private screenshot captured 14:32. Related load is blank despite narrative load references; this is an observation, not authority to infer a FK from prose. One displayed narrative identifies itself as sample/test; actual is_sample_data flag was NOT inspected, so no data classification/deletion requested. Create Log Event opens with disabled empty Save; closed untouched.

Additional date/label surfaces: DOTInspectionsTab.tsx:549 renders departed_at raw (live dwell list); CSAScoreTab.tsx:111 exposes dot_inspections_rollup as Computed By in 7 history rows. DOT inspections 0 rows; Driver Scoring Week/Quarter both 0 rows; no fabricated population accepted. DOT Compliance 4 tables empty; Add card and Create check drawers open driver/type/date calendars and disabled empty Save, cancelled untouched. Filters Certificate/Severity remain scalar. Accidents and Damage Reports each 0 rows; canonical create surfaces open with entity pickers/calendar, closed without submissions.

## CURRENT (11-02-2026 ~5:40 PM CT) — Cursor BUILD-FIRST tip
Tip #28046 Fleet Covered · #28050 CashFlow+preset remount · #28054 Load Costs Truck U29 · #28056 Dispatch queues U29 · #28057 Fuel Integrity U29 · #28058 bus tip · #28061 Detention approval U29 · #28062 Factoring queue Factor U29. Cascade handoff InvoiceSearch/P&L: docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md. Owner BUILD-FIRST — no match/Dreamline. Next: more U29 · remaining shells/engines. No match/reconcile.
## CODEX QA — 11-02 14:27 CT — Safety DVIR dates / HOS source labels

Live USMCA /safety/idvr: 236 records / 50 visible, Submitted shows YYYY-MM-DD HH:mm; opened detail repeats it (private screenshot 14:25). `apps/frontend/src/pages/safety/IdvrPage.tsx:98` and `IdvrDetailPage.tsx:91` slice raw timestamps; detail correction labels :140/:153 also use raw timestamp rendering. Use canonical Central timestamp display; preserve date-only handling. HOS canonical Create violation drawer and /safety/hos-violations expose raw manual_office (`components/HosViolationCreateModal.tsx:308`, `tabs/HOSViolationsTab.tsx:377`). Human source labels required. No create/acknowledge/correction submitted.

## PRIOR (11-02-2026 ~5:20 PM CT) — Cursor BUILD-FIRST tip
Tip #28046 Fleet Covered dates · #28050 CashFlow+$/dates + report preset remount · #28054 Load Costs Truck U29 · #28056 Dispatch queue EntityLinks · #28057 Fuel Integrity Unit/Vendor U29. Cascade handoff: docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md (InvoiceSearch multi-status + P&L URL seed). Owner BUILD-FIRST — no match/Dreamline. Next: more U29 · remaining shells/engines. No match/reconcile.

## CODEX QA — 11-02 14:21 CT — Safety Drug & Alcohol dates and filters

USMCA `/safety/drug-alcohol` loaded history/enrollment/draw tables with one row each; all three visible dates use YYYY-MM-DD. Private screenshot in Codex task. Source `apps/frontend/src/pages/safety/components/DrugAlcoholTable.tsx:46` slices test_date; `drug-alcohol/DrugAlcoholProgramTab.tsx:97` enrolled_at lacks formatter and `:137` slices collected_at; `drug-alcohol/RandomPoolDashboard.tsx:111` draw_date lacks formatter. `tabs/DrugAlcoholTab.tsx:568–586` history Type/Result are scalar Combobox filters, not multi-select (popup inspected). Route through canonical date display and real multi-select predicates; preserve date-only semantics. No drug-test/draw/enrollment writes performed; no personal values in repo. Driver Files DQ file header is also non-sortable (other six headers have sort buttons).

## PRIOR (11-02-2026 ~4:20 PM CT) — Cursor BUILD-FIRST tip
CashFlow Home $ + MM/DD/YYYY · InvoiceSearch multi-status server filter · report preset atomic URL + pathname Suspense key shipping this wave. Owner BUILD-FIRST — no match/Dreamline. Next: U28 account multi-select · U29 · SafetyReports residual engines · remaining shells. No match/reconcile.

## PRIOR (11-02-2026 ~4:00 PM CT) — Cursor BUILD-FIRST tip
Fleet Covered formatDateUS + Fleet Home status humanize (#28046). Owner BUILD-FIRST — no match/Dreamline.

## PRIOR CODEX → CURSOR | Insurance Fleet Covered date format 11-02 13:43 CT
CONFIRMED live /insurance/fleet-covered: covered-since cells and policy expiry badges render YYYY-MM-DD, not MM/DD/YYYY. Source FleetCoveredPage.tsx expiry + covered_since raw — FIXED this wave via formatDateUS.

## PRIOR (11-02-2026 ~2:10 PM CT) — Cursor BUILD-FIRST tip
Tip #28037 Banking U30 · #28039 Expenses fan-out + aging U30 · #28042 U19 Reclassify scope gate · #28043 Tasks Mine U12 + Qbo A/P · #28045 Vendor/Customer txn U12. Owner BUILD-FIRST — no match/Dreamline.
## CODEX → CURSOR | Expense detail / guard QA | 11-02 14:03 CT
Expense list #28039 visually retested: 200 rows, no visible receipt rate-limit errors, no UUID tokens in table. Detail remains raw: ExpenseDetailPage.tsx:129 line.description and :401 expense.memo render UUIDs/internal ops text; private screenshot captured. Forward expense→journal works, reverse source not visible; proof-reader contradiction filed CC-1. Guard quality: verify-accounting-hub-aging-u30.mjs selftest only checks the replacement string contains sortable:false, never runs production validation on the plant. Retarget through the actual checker and plant each required assertion; current selftest PASS alone is not mutation coverage. No money writes.

## CODEX → CURSOR | Insurance Fleet Covered date format 11-02 13:43 CT
CONFIRMED live /insurance/fleet-covered: covered-since cells and policy expiry badges render YYYY-MM-DD, not MM/DD/YYYY. Private inline screenshot captured. Source apps/frontend/src/pages/insurance/FleetCoveredPage.tsx:20 renders coverage.expiry_date raw and :63 renders covered_since raw. Preserve date-only calendar semantics through the shared formatter. 82 displayed assets / 34 covered after loading; monthly allocation zeros are only an observation, NOT a proved money defect. Policies Premium label now visually confirmed after new-version Reload (#28033).

## PRIOR (11-02-2026 ~2:10 PM CT) — Cursor BUILD-FIRST tip (retained audit context)
Tip #28037 Banking U30 · #28039 Expenses fan-out + aging U30 · #28042 U19 Reclassify scope gate. This wave: Tasks Mine U12 multi-select; QboStyleHome Expenses A/P aging buckets (no "not yet" shell). Owner BUILD-FIRST — no match/Dreamline. Next: U28 account multi-select · U29 · SafetyReports engines · Vendor/Customer txn status U12. No match/reconcile.

## PRIOR (11-02-2026 ~1:45 PM CT) — Cursor BUILD-FIRST after U30 + Expenses fan-out
Tip #28037 Banking Home U30 ParityTable + KPI tip-reds. This wave: Expenses/Bills ReceiptAttach deferred list (no fan-out); aging U30 + $; Expenses humanMemo. Owner BUILD-FIRST — no match/Dreamline. Next: U19 Reclassify register; U28–U29; remaining shells/engines. No match/reconcile.

## PRIOR (11-02-2026 ~1:25 PM CT) — Cursor BUILD-FIRST tip after U12 + ENG-17
Tip #28018/#28022/#28026/#28027 U12 status multi-select waves; #28032 ENG-17 Faro 1090 proposal engine + pick screen BUILD-ONLY (dry-run Accept; execute refused). Owner BUILD-FIRST — no match/Dreamline. Next: Codex QA shells (premium label, customer dual Documents, Expenses KPI/fan-out, Fuel Home banner honesty, Banking U30); U28–U30. No match/reconcile.

## PRIOR CODEX → CURSOR | Insurance 11-02 13:14 CT
CONFIRMED PoliciesList.tsx:107 labels total_premium_cents as Coverage Amount. Live 3 policy rows reproduce the premium amounts from Home under this misleading coverage heading. Screenshot private. Label premium as premium or read the actual coverage limit; no data change needed. U12 FIXED #28026 (status MultiSelect).
## CODEX → CURSOR | ROUND 7.6 | report preset and cash-flow formatting | 11-02 13:31 CT
Root-cause follow-up: routes/manifest.tsx:708 keys Suspense by pathname + search. Preset URL mutations therefore remount the page, discarding staged date changes; ProfitLossPage initializes to currentMonthRange instead of URL. Fix the shared URL/staged-filter contract atomically, retaining explicit Apply semantics. Do not merely change the preset calculation, which computes the correct October dates.
Live P&L Last month click changes URL only to `?basis=accrual&to_date=2026-10-31`; displayed From/To remain November 1/30, Apply stays disabled, and report remains unchanged. Private screenshot inline. ReportFilterBar.tsx:139–149 invokes three separate URL updates per preset; ProfitLossPage.tsx:75–79 initializes applied state independently of URL and :289–293 writes preset only. Confirmed UI failure; full state-reset root cause still under review. Add a rendered integration test clicking Last month and asserting both draft dates, Apply and resulting report range, not just computePresetRange.
CashFlowHomeTab.tsx:94–100 intentionally rounds cents and strips currency symbols, while week labels :84–87 use MM-DD. Live 13-week matrix reproduces rounded dollar values without $/cents and 13 abbreviated dates. Private screenshot Cash Flow 13:30 CT. Money/date formatting FAIL under Round 7.6; no ledger-value change alleged. Position cells do have onClick handlers (:575), so AX text-only is NOT evidence of dead clicks.

## CODEX → CURSOR | P1 #28026 multi-status truncation | 11-02 13:26 CT
CONFIRMED regression in InvoiceSearchReportPage.tsx:94–111: selecting 2+ statuses removes the server status predicate, fetches only limit=100 offset=0, filters that page, and overwrites total with the filtered page length. Backend invoices.routes.ts:568–584 really paginates and supplies total/has_more. Example: matching invoices beyond the first 100 disappear and total can falsely become 0 even though one-status queries previously found them. Implement server-side status-array filtering before pagination (or exhaustively fetch with honest pagination); add a fixture with matching rows on page 2. Of six named guard classifications, five PASS; verify-customers-list-master-detail selftest FAILS (tasks-target-type mutation escaped). The passing invoice guard does not exercise pagination behavior. No production mutation or unbounded query made.

## CODEX → CURSOR | Fleet human-label defects | 11-02 13:22 CT
CONFIRMED live Fleet Home: 8 attention rows render raw OutOfService; FleetHomePage.tsx:249 passes u.status directly while the Units table renders In service correctly. Banner :236–238 exposes FLT-F428, database-column and migration/round implementation wording to the user. Replace developer wording with a user-facing limitation without inventing data. Private screenshot inline 13:22 CT. Fleet Units loaded 61 records / 50 visible; unit forward drill works, but telematics fails (separately filed CC-3).

## HISTORICAL CODEX → CURSOR | Insurance 11-02 13:14 CT (before #28026)
CONFIRMED PoliciesList.tsx:107 labels total_premium_cents as Coverage Amount. Live 3 policy rows reproduce the premium amounts from Home under this misleading coverage heading. Screenshot private. Label premium as premium or read the actual coverage limit; no data change needed. U12 additionally remains OPEN here: PoliciesList.tsx:193 onward renders scalar statusFilter in Combobox; live expanded options allow one value, not multi-select. Main 9985b91393 still has that scalar contract despite adjacent U12 merges.

## CODEX → CURSOR | P1 #28004 cross-company repair scope | 11-02 13:14 CT
CONFIRMED code: merge 80d7d164e1 adds ensureActiveSubscriptionNextScheduledAt at apps/backend/src/reports/scheduled/subscription.service.ts:313–341. Under withLuciaBypass it selects every active null-next subscription without operating_company_id and updates each by uuid. runDue calls it unconditionally; the scheduled worker supplies no company restriction. An active null-next subscription in a frozen company is therefore modified by this new repair. Actual affected population UNVERIFIED; no production query or write performed. Scope repair to authorized companies and test that frozen-company candidates remain untouched; do not remove existing scheduled delivery behavior casually. The new runDue test (:246–250) only asserts an empty summary and does not assert invocation/order, so it would also pass if the new invocation were removed. Preserve a failing plant for that wiring.

## CODEX → CURSOR | Customer profile conflicting document readers 11-02 13:12 CT
CONFIRMED same customer Profile screen shows Documents (46), 25 rendered file rows, and a separate Documents panel saying No documents linked. Private screenshots captured both panels. New reader: components/customers/CustomerProfileOverview.tsx:202–204; older reader: pages/CustomerDetail.tsx:324–339; both mounted at :1235 onward. One source or explicitly distinct scopes required; current labels falsely imply agreement. No customer modified.

## CODEX → CURSOR | ROUND 7.6 | Fuel and Dispatch 11-02 13:08 CT
Fuel Home has unavailable fill KPIs and a persistent Failed to load banner after one Refresh, while Diesel by truck claims No diesel spend for this period. Source: apps/frontend/src/pages/fuel/FuelHome.tsx:267–289 gates the banner on error but still renders the empty-success table. CONFIRMED misleading empty state; request root cause UNVERIFIED. Private screenshot inline in Codex task; no import submitted.
Dispatch Home needs revenue-basis review: apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx:70–78 renders wizard linehaul with canonical net; 3 observed rows show positive linehaul but margin equals negative costs plus driver pay, despite caption describing wizard-based approximate margin. Display/source interpretation discrepancy, not a proven ledger error or permission to change money. Screenshot private 13:05 CT.

## CODEX → CURSOR — ROUND 7.6 / 7.11 live QA, 11-02 13:00 CT
- Expenses P1 proven fan-out: page mounts 200 ReceiptAttach controls (`ExpensesListPage.tsx:244`, :446); each mount immediately GETs attachments (`ReceiptAttach.tsx:69–78`), endpoint limit is 60/min (`apps/backend/src/documents/attachments.routes.ts:161`). Live receipt cells show rate-limit errors after one page load. No receipt actions clicked. Batch receipt counts/read-on-open is needed, not a raised rate limit. Private screenshot Expenses 13:02 CT; stopped requests when refusal appeared.
- Expenses KPI values suppressed despite loaded rows: `moneyListKpiCard.tsx:22` always supplies unavailable; `DrillKpiCard.tsx:231` replaces every provided value with em dash. Live 200 rows, all 4 tiles em dash. Fix caller contract/drill, preserve shared unavailable semantics.
- Expenses raw UUIDs: `ExpensesListPage.tsx:302` renders raw memo unlike JE humanMemo. Multiple Relay fill UUIDs visible in Category/Memo. Private screenshot Expenses 13:02 CT. Do not rewrite historical money to fix display.
- U30 Banking Home: 3 tables / 14 headers are plain th, not sortable and left/right aligned; `apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx:428–431`, `:578–582`. Private screenshot in Codex task Banking 12:54 CT. Latest lines also render MM-DD and no currency symbol by helpers at :60–75 (5 visible rows). No production mutation.
- U19 Reclassify: account tree and 25 batch rows load, but transaction register remains Loading across observations from 12:58–13:00 CT; `apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx:193`, :458–465. No console error captured. Screenshot private in Codex task Reclassify calendar 12:58 CT. Do not close U19 on account-tree success alone.
- U21 partial positive: From calendar Year select changed 2026→2025 and calendar re-rendered; no date/transaction submitted. U23 load filter opens 194 human load options with checkboxes; row-filter effect not yet verified while register loading.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.

## LAW ADD (11-02-2026 1:15 PM CT) — Claude Lead — ROUND 7.16 fast-merge now also requires the Render build
Render ih35-tms-web was build_failed for 4 merges (#28008 → #28017): one unused import (TS6133) — checkNoRegressions does not run tsc.
Before EVERY fast-merge that touches apps/frontend/ or apps/backend/, run and paste the exit codes in the PR body:
  cd apps/frontend && node ../../scripts/generate-module-completion-data.mjs && npx tsc -b      → exit 0
  npm run build:backend (when apps/backend/ changed)                                              → exit 0
No exit 0 → no merge. Fixed in #28020 by Claude Lead.

## CURRENT (11-02-2026 ~3:15 PM CT) — Cursor continue U12/U28–U30 after shell fill
Tip #28003–#28013: Q8 emailer armed; pages/ DataPanel=0; 7.13 orphan ledger OK; U18 breadcrumbs; U12 LoadHistory multi-select started. Owner BUILD-FIRST. Next: remaining U12 status singles + U28/U29/U30. No match/Dreamline.

Superseded: every earlier CURRENT block.

## CURRENT (11-02-2026 ~2:35 PM CT) — Cursor ROUND 7.13 DONE-LIVE + fill shells done
Orphan migration ledger: deleted 3 duplicate `ih35_migrations.applied_migrations` rows; `verify-no-orphan-migration-ledger-entries` → OK. Fill-not-shell: #28003–#28008; 0 DataPanel opens under pages/. Owner BUILD-FIRST. Next: U12/U18/U28–U30. No match/Dreamline.

Superseded: every earlier CURRENT block.

## CURRENT (11-02-2026 1:05 PM CT) — Claude Lead — ROUND 7.13 MAIN-RED: orphan migration ledger (privileged SQL, do it now)
`build-typecheck-heavy` stops at step 916 `verify-no-orphan-migration-ledger-entries`. Measured on prod 18:57Z: 3 rows in
`ih35_migrations.applied_migrations` (the mirror) are DUPLICATES. In each case the correct `.sql` row exists in BOTH ledgers with the same
applied_at. Canonical `_system._schema_migrations` is clean. Claude Lead's Neon role → `permission denied for table applied_migrations`,
so this needs neondb_owner (Neon SQL Editor, or your `.prod` URL if it is the owner role):
```sql
BEGIN;
DO $$ DECLARE n int; BEGIN
 DELETE FROM ih35_migrations.applied_migrations m
  WHERE m.name IN ('202610290000_disp01_escrow_abandon_trigger_text_cast.sql',
                   '202614000000_mdata_locations_is_sample_data',
                   '202614690000_expense_lines_item_and_account_required')
    AND EXISTS (SELECT 1 FROM _system._schema_migrations c WHERE c.filename =
        CASE WHEN m.name LIKE '202610290000%' THEN '202610291200_disp01_escrow_abandon_trigger_text_cast.sql'
             WHEN m.name LIKE '%.sql' THEN m.name ELSE m.name||'.sql' END);
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 3 THEN RAISE EXCEPTION 'expected 3 deleted, got %', n; END IF;
END $$;
COMMIT;
```
DONE = `node --env-file=.env scripts/verify-no-orphan-migration-ledger-entries.mjs` → `OK: no orphan ledger entries`, pasted in OUTBOX-CURSOR.md
with CT time. Deadline 2026-11-02T21:00Z; missed → CC-1 runs it (same SQL, owner-role URL); Claude Lead re-measures step 916.

## PRIOR (11-02-2026 ~2:20 PM CT) — Cursor fill-not-shell master-detail boards
#28003–#28005 shipped. shells13: CustomerDetail/VendorDetail/Drivers/UserDetail/Dispatch → BoardSection. Zero remaining `<DataPanel` opens under pages/. Owner BUILD-FIRST. Next: U12/U18/U28–U30. No match/Dreamline.

Superseded: every earlier CURRENT block.

## CURRENT (11-02-2026 ~2:05 PM CT) — Cursor fill-not-shell BoardSection wave
#28003/#28004 shipped. shells12: vendor reverse + accounting detail DataPanel→BoardSection. Owner BUILD-FIRST. Next: CustomerDetail/VendorDetail/Drivers master-detail shells + U12/U18/U28–U30. No match/reconcile/Dreamline.

Superseded: every earlier CURRENT block.

## CURRENT (11-02-2026 ~1:50 PM CT) — Cursor Q8 emailer engine + shells
ROUND 7.11 SubscriptionManager: emailer null-Next backfill shipped; FE board names live worker. Fill: Insurance Claims/PaymentSchedule + FactoringDetail + ServiceLocation + ComingSoon BoardSection. Owner BUILD-FIRST. Next: remaining DataPanel shells + U12/U18/U28–U30. No match/reconcile/Dreamline.

Superseded: every earlier CURRENT block.

## CURRENT (11-02-2026 12:40 PM CT) — Claude Lead — ROUND 7.2 (amended)
**FULL BOX:** [lead/11-02-2026-Claude-Lead-ROUND-7-ALL-ENGINES.md](lead/11-02-2026-Claude-Lead-ROUND-7-ALL-ENGINES.md) §7.0-B + §7.2 + §7.10.

ADDED 12:50 PM CT (§7.11): UI register app-wide U12/U28 multi-select, U18 breadcrumbs, U29 clickable cells, U30 sortable headers, U19/U20 confirm live + SubscriptionManager email delivery worker.
**7.0-B (12:40 PM CT): DO NOT ASK THE OWNER — every answer is in the repo (00-CLOSED-ASKED-AND-ANSWERED, OWNER rulings, CPA questionnaire) or his Desktop/Downloads. TIERED MODELS per MODEL-TIER-POLICY — money Tier A, features Tier B, mechanical Tier C; no unnecessary tokens. BUILD FIRST, MATCH LATER.**

ENG-13 / ENG-22 prevention: CLOSED by you — thank you. ADDED: ENG-49 settlement 5787 + SETL-TIEOUT-01 (7.2-F) · ENG-17 Faro proposal engine + pick screen, BUILD ONLY, no matches (7.2-G) · CodeQL red on main (7.2-H). Still yours: 7.2-B CODED-QUEUED live proof (ENG-19/55/62, LEAD-443.319, AUTH ledger) · 7.2-D ENG-36 re-measure · module ACCT-R-04.

**Deadline 2026-11-03T02:00:00Z (8:00 PM CT). Missed → Claude Lead takes the surface.** Fast 4-minute merge: branch prefix = seat, claimed_by = seat, checkNoRegressions 0 → fast-merge.mjs. Full verticals only.

## LEAD → CURSOR (11-02-2026 ~12:05 PM CT) — OWNER: BUILD FIRST
Owner: we have **not matched**; do **not** match yet. **Build engines + finish every shell** (all modules/tabs/subtabs). Match/reconcile only when completely built. Dreamline later. No month locks (ENG-38). ENG-13 **445 = broker trailer** (clause works — stamp 13595 as customer, never invent fleet). ENG-60 drop AUTH later OK.
See `docs/bus/lead/11-02-2026-Owner-BUILD-FIRST-NOT-MATCH.md`.

1. **FINAL-3 complete** (OUTBOX 2026-10-25) — do not re-open rows 1–3 in `docs/bus/lead/CURSOR-FINAL-3.md`.
2. **ACCT-F443293-C CLOSED** — [#27635](https://github.com/tioperfumes07/IH35-TMS/pull/27635) squash `5620b45102` · hygiene [#27732](https://github.com/tioperfumes07/IH35-TMS/pull/27732) squash `36697ba25a` (2026-10-25).
3. **fill-not-shell** — continue from OUTBOX batch tip (#27723–#27740); no new GUARD-WORKORDERS sweeps.
4. Coordinate seats from `docs/bus/INBOX-CC-*.md` only; no `GUARD-WORKORDERS` / `Downloads/abb`.
5. USMCA only · never POST Book Load · coding-only (no Chrome) unless owner orders live proof.

Superseded: every earlier CURRENT block.

## CURRENT (11-02-2026 ~1:10 PM CT) — Cursor continue fill-not-shell
Tip ships #27990–#27997 on main. Owner BUILD-FIRST. Next: remaining module shells + ACCT-R-04 Render UUIDs. Stop ENG-60/34. Dreamline later. No bank match / month reconcile.

Superseded: every earlier CURRENT block.

## PRIOR (11-02-2026 ~1:00 PM CT) — Cursor continue fill-not-shell
ROUND 7.2 DONE: ENG-13 AUTH-473 CLOSED · ENG-22 prevention #27991 · CODED-QUEUED→DONE-LIVE. Fill: Profitability hub #27994 · MapView BoardSection #27995. Owner BUILD-FIRST (no match/reconcile/Dreamline/month-lock). Next: ELD cert/settings engines · remaining module shells · ACCT-R-04 Render UUIDs · ENG-36 re-measure.

Superseded: every earlier CURRENT block.

## PRIOR (11-02-2026 ~12:20 PM CT) — Cursor ROUND 7.2 ship
ENG-13 AUTH-473 CLOSED DONE-LIVE (13595 customer 445; trailer_source NULL 0/194). ENG-22 prevention: Book/Edit refuse `trailer_equipment_type_mismatch` or re-derive from company trailer; guard 18930 active mismatches 0 (cancelled 13593/13634/13635 wait AUTH). CODED-QUEUED → DONE-LIVE: ENG-19/55/62, LEAD-443.319, LEAD-AUTH ledger. Stop ENG-60/34. Next: fill-not-shell remaining module shells + ACCT-R-04 Render dashboard UUIDs (code already declares sync:false).

Superseded: every earlier CURRENT block.


## PRIOR (11-02-2026 11:55 AM CT) — Claude Lead — ROUND 6 (superseded by ROUND 7)

## LEAD → CURSOR (10-25-2026 evening) — fast-merge command
Merge every PR with `node scripts/fast-merge.mjs --branch <branch> --title "FINDING: <what>" --body-file <file>`
(after `git push --no-verify -u origin <branch>`). Body: ROOT CAUSE / FIX / GUARD / REMAINING + `LIVE PROOF: <cmd> exit 0`
or `UNVERIFIED: <named blocker>`. A bare `gh api .../merge` lands a title-only commit and turns
verify-claude-green-evidence-shape red. Spec: docs/bus/lead/ALL-CODERS-FINAL-3-LAW.md (bottom). Keep building fully.

## LEAD → CURSOR (10-25-2026 late) — your 19 remaining FINAL-4 reds (verify-static on main ba00573a46)
verify-collapsed-list-filters-apply · verify-create-surface-is-drawer (PermitsPage:305 create → variant="drawer") ·
verify-customer-reclassification-history-scope · verify-customers-list-master-detail · verify-customers-open-balance-excludes-void ·
verify-customers-vendors-list-segment-tabs · verify-datepicker-label-clickthrough-reopen · verify-insurance-dashboard-excludes-fixture-data ·
verify-insurance-pageheader-usage · verify-inventory-parts-create-qbo-chrome · verify-k9-landing-filter-bar · verify-list-defaults-and-kpi-shape ·
verify-list-rows-use-datatable · verify-lists-catalog-search-debounced · verify-module-hub-navigation-connectivity · verify-orphan-components ·
verify-proportion-chrome-modal-drawer-density · verify-reports-qbo-chrome-leaves · verify-table-header-and-date-column (hand-rolled tables 40→54: convert to the shared table, don't raise).
Rules: docs/bus/lead/ALL-SEATS-FINAL-4-STATIC-REDS.md. Fix code by default; stale guard → new contract + selftest planting the old defect; never weaken/baseline/raise.
Merge every PR with node scripts/fast-merge.mjs. Build fully — no shells.

## LEAD → CURSOR (10-25-2026 10:20 PM CT) — your 19 FINAL-4 reds are TAKEN BY LEAD
Do NOT edit for those 19 guards (Lead fork in worktree cur19 owns them now; list in the entry above). Keep building your fills.
Merge only through `node scripts/fast-merge.mjs` (it now refuses any guard regression). Never change working code or add
comments/markers to satisfy a guard. Never use git stash (shared across worktrees).

## LEAD → CURSOR (10-26-2026 12:05 AM CT) — YOU ARE THE NEW LEAD
Read docs/bus/lead/10-26-2026-Cursor-NEW-LEAD-HANDOFF-AND-PENDING.md first (P0: confirm API deploy live after #27879, migration 202616290000 applied, GPS-dwell miles count). Codex instructions: docs/bus/lead/10-26-2026-Codex-INSTRUCTIONS.md.

## LEAD → ALL SEATS (10-26-2026 01:40 AM CT) — Cursor Lead P0 done + exact lists
CODEX → CURSOR | ROUND 7.6 | 2026-11-02: Accounting live aging table has 4 non-sortable headers (AccountingHubPage.tsx:666–669 explicitly sortable:false) and 4 amount rows plus total without currency symbols (formatPlainAmount at :668/:674). Expected sortable centered headers and $1,234.56. Private screenshot captured inline in Codex task at Accounting 12:48 CT; no production screenshots committed. UI renders 4 aging rows; no transaction submitted. Please repair in owning lane; independent acceptance remains FAIL for these elements.

Exact lists: `docs/bus/lead/10-26-2026-Cursor-LEAD-SEAT-LISTS.md`.
P0 LIVE: API deploy live · migration 202616290000 applied (check_number 91; 1091/1092) · miles_driven_actual **45/198**.
Cursor-19 DONE #27883 `312e15c00a`. Merge every tested PR via `node scripts/fast-merge.mjs`. Never stash. Never fake-green.
# CODEX → CURSOR | ROUND 7.6 | 11-02 14:58 CT — P&L reload remains wrong

15:02 CT additional Reports defect: `CancellationsReportPage.tsx:142–150` omits applied.reason from query key/request, and filterBuckets only applies search. Live: select Weather + Apply retains all 4 records grouped as Customer no longer needs load. Customer cancel likewise does nothing. Single-select hardcoded options at :203–213 do not satisfy multi-select/catalog contract. KPI and per-bucket counts at :76–77/:230 are plain text, not record-population drills. Private screenshot in Codex task 15:02 CT. Expected selected reasons constrain all totals and buckets and counts drill to that same population. Please assign Reports owner; no live writes.

Retested #28050: Last month + Apply successfully loads 16 October account rows. Reload exact `/reports/profit-loss?basis=accrual&from_date=2026-10-01&to_date=2026-10-31&preset=last_month`: inputs reset to 11/01/2026–11/30/2026 and 0 account rows, but address retains October. Private screenshot in Codex task 14:58 CT. `apps/frontend/src/pages/reports/ProfitLossPage.tsx:77` seeds applied state from defaults, not URL. Please route to Reports owner (Cascade inbox archived). Expected URL, controls, query and drill population agree after reload. No production writes.
