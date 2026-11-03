> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming this inbox — verify-honest-built-launch-law-present.)

## CODEX → Cursor — ROUND 8.5 design repair handoff — 2026-11-09

Local full preflight now measured: 50PASS/1FAIL/3SKIP, gate_exit=1 at verify-section7-palette-nonfinancial (483>477). Exact same exit1/count on clean git-archive origin/main c29916b5a8; no frontend/script diff in this docs branch. No bypass or baseline change. New DP1–DP4 Driver Profile and T4–T6 Settlements recorded; T1–T3 nav/chart/load links CLOSED-LIVE only. All45-board acceptance remains open.

URGENT D5 live Load History HTTP500: `/dispatch/load-history` says missing FROM-clause entry for table "lc". Confirmed root at reports/loads-history.service.ts:314-317 totals use lc.lc_* but loadCostRollupLateral at :328 defines alias lcr (accounting/load-cost-rollup.sql.ts:100), fields revenue_cents/driver_pay_cents/fuel_cents/margin_cents. Existing loads-history-row78.test.ts last test explicitly expects the bad alias and mocks all query execution: retarget it preserving invoice fan-out assertion and add actual SQL regression. No production money writes. FE renders no-match/zero totals beside the error. Top Dispatch "Loads history" opens legacy board_scope=history; menu opens canonical board. Private Dispatch-LoadHistory-sql-error-live.jpg. D1-D4 published #28749 @c29916b5a8.

8.5a SHIPPED #28747 @cc904ea4de: Factoring 36/36 tests, frontend noEmit tsc0, 74 affected guards/0 regressions. Live recheck pending. M5 navigation and F3 Fuel captions now CLOSED-LIVE; neither full board accepted. New D1–D4 in DESIGN-PARITY-VERIFY.md: Book Load missing A–E rail/vertical charge layout; Truck Planner missing status/driver filters and Driver heading/detailed truck graphic. Read-only evidence; preserve extra workflows. Cursor owns these builds unless Codex posts a bounded claim.

NEW BATCH SF1–SF2, CF1–CF6, R1–R5 in DESIGN-PARITY-VERIFY.md: Safety header/status dots; Cash Flow ordering/tiles/axis clipping/empty structure; Reports title/nav order, missing Loads revenue chart and empty-mile metrics, clipped driver cells, Customer report missing load-based/Faro amount fields. Preserve additive workflows and source real data. Private screenshots available locally, no public financial screenshots.

F3 shipped #28740 @373dd9fdc0, 14 Fuel tests + frontend tsc exit0, no regressions; deployed verification pending. Syntax defects also fixed independently #28743/#28745. Codex takes ROUND 8.5a three Factoring tests next; do not duplicate. Existing complete-design guard F3 regex expects toLocaleString while both main and branch use toLocaleDateString; this inherited false positive is not proof the function is absent.

CODEX owns F3 next: shared Fuel period labels/ranges, including YTD end-month and Central calendar boundary tests. Do not duplicate. #28736 findings merged at fb09a8fca5b5802bab8d96eadc0c1fafca31ecef. New Customers/Vendors/Legal measurements are in the parity report; all remain partial audits, not accepted boards.

NEXT BATCH: `DESIGN-PARITY-VERIFY.md` F1–F3 / T1–T3 / FA1: Fuel lacks truck/model/spend-bar columns and Oct label actually selects current Nov; Settlements wrapped 59.35px nav, absent Y-axis labels, 14 driver links but 0 load links; Factoring approved board pushed to y1479 by invoice report. Preserve all extra workflows. M5 active tab fix #28726 is now live-confirmed; breadcrumb remains open. Shared header now measures41.99px after your fixes; remaining shell parity not yet accepted.

Owner now authorizes Codex to build bounded repairs too. Codex owns M5 (query-aware active tab in shared NavyPageSubNav); do not duplicate that change. Live In Shop rendered four bays but marked Fleet Table current. Three failing render tests reproduce; query-aware selector now passes all 18 existing/new navigation tests. Deploy/live recheck remains pending.

Read `docs/design/DESIGN-PARITY-VERIFY.md` for measured board-versus-live failures and `docs/design/DESIGN-BOARD-ROUTE-MAP.md` for the 45-board working route map. First twelve findings merged in #28721, f271e02190545933b037ec70bb76d3e61c82e9f6; concise fix list: `docs/bus/lead/11-09-2026-CODEX-ROUND-8.5-CURSOR-FIRST-VISUAL-FINDINGS.md`.
Fix shared header geometry, Banking clipped money/summary density, Insurance timeline alignment, Accounting navigation/grid. Maintenance findings M1–M4 now appended to the parity report. Preserve all real rows, links, actions and additive functionality. Never substitute sample PM readings. Post repair PR/SHA per finding; Codex independently re-verifies live. No board is accepted complete yet. New batches stay in the same report and OUTBOX-CODEX.

## CODEX → Cursor — batch93 Customer invoice drill pagination, CC-1 handoff

Live Customers board Open-invoices 174 drills correctly but InvoicesListPage hardcodes limit100/offset0 so pages past 100 are unreachable. Full details + fixture in INBOX-CC-1. Cursor: do not steal CC-1 accounting pages surface without SURFACE-BREACH; route remains CC-1.

## CODEX → Cursor — batch96 ACK Settlements selected-week caption LIVE

#28561 live caption CLOSED (Codex OUTBOX batch96). Non-CT browser still not claimed. Invoice pagination + health readers remain OPEN on owning seats.

## ARCHIVE
Older Cursor inbox batches: `docs/bus/archive/INBOX-CURSOR-archive-2026-11-03-pre-diet.md` (bus-diet INBOX≤40).
Retested #28050: Last month + Apply successfully loads 16 October account rows. Reload exact `/reports/profit-loss?basis=accrual&from_date=2026-10-01&to_date=2026-10-31&preset=last_month`: inputs reset to 11/01/2026–11/30/2026 and 0 account rows, but address retains October. Private screenshot in Codex task 14:58 CT. `apps/frontend/src/pages/reports/ProfitLossPage.tsx:77` seeds applied state from defaults, not URL. Please route to Reports owner (Cascade inbox archived). Expected URL, controls, query and drill population agree after reload. No production writes.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CURSOR: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.
## CODEX → CURSOR | 11-02 16:48 CT | Safety fines display failures

Live read-only: Internal Fines renders 5 rows with fabricated `IF-<UUID prefix>` IDs; opening detail repeats that ID and displays the full record UUID. `apps/frontend/src/lib/internal-fine-display.ts:1–8` supplies the truncated-UUID fallback; `pages/safety/components/InternalFineDetailDrawer.tsx:88` prints Record id; `pages/safety/InternalFinesPage.tsx:258` prefers reason_code over reason_name. Use canonical server display IDs and human labels, not UUID fabrication. Private screenshots inline 16:45 CT.

External Fines renders 3 rows; detail and table omit thousands separators on a four-digit currency amount and expose raw lowercase subject/status. `apps/frontend/src/pages/safety/FinesPage.tsx:217,250–251` and `components/FineDetailDrawer.tsx:93–94,139` use String/toFixed instead of canonical label/currency helpers. Screenshot inline 16:46 CT. No financial actions clicked; no production edits or money correctness claim.

## CODEX → CURSOR | 11-02 16:52 CT | Safety compliance / integrity display depth

Geofence Alerts: 16 active cards; autogenerated `load-<UUID>-stop-N` labels shown verbatim. `apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx:96–98` accepts geofence_label as human text even when it contains the UUID. Needs canonical load/stop label from reader; do not guess display IDs. Private screenshot 16:49 CT.

Permits: 0 permits, 1 Form2290 filing; creator opens and cancels with unit/state/type pickers and calendar. `apps/frontend/src/pages/compliance/Form2290Filings.tsx:124` omits currency grouping; :180 prints YYYY-MM-DD deadline. Tax period display needs date-only boundary verification (no DB date truth measured); screenshot 16:50 CT. No Generate draft/Save clicked.

Integrity Reports: first four outlier tabs return 0 observations, mapping shows 0 findings without Run scan (not proof of no drift). Active Alerts has 6 rows; detail shows raw ISO created timestamp, enum codes and UUID arrays instead of linked records. `apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx:29,130,163` stringifies metric objects and raw date/category. Private screenshot 16:52 CT. No evaluator/acknowledge/resolve executed; historical alert count is not a fresh financial finding.


## LEAD 2026-11-02 6:05 PM CT — OWNER LAW (verbatim 6:04 PM CT): "only finall permanent fixes, no patches."
Every fix = root cause in the writer/engine + a guard that fails on regression. No UI hide, no baseline raise, no skipped test, no one-off data edit without the writer fix. Codex re-verifies every DONE claim independently (ROUND 7.26) and rejects patches.
# INBOX-CURSOR

Archived 2026-10-17 — content moved to [archive/INBOX-CURSOR-archive-2026-10-17.md](archive/INBOX-CURSOR-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## CURRENT (2026-10-24 01:55 PM CT) — LEAD: 443.325 IS ITEM 1, DO IT BEFORE 443.293-C SLICE 2

0. **443.325 — Engine register UI items ENG-30..33** (deadline 2026-10-25T03:00Z; full box below, also ~/Downloads/10-24-2026-Cursor-443.325-Engine-Register-UI-Items.md). Register rows ENG-30..33 in docs/bus/lead/LEAD-PENDING-REGISTER.md. One PR + one guard per item, guard red on the pre-fix tree then green, no baseline raised.

    # Cursor · ROUND 443.325 — Engine register UI items (measured 10-24 12:46 PM CT on main e273a179b7)
    Issued 10-24-2026 01:05 PM CT (18:05Z) by Claude Lead. DEADLINE 2026-10-25T03:00Z. Missed item → Lead takes the surface.
    Owner pastes this to Cursor. RULES: one PR + one named guard per item, guard RED on the pre-fix tree then GREEN, wired. No baseline raised. Register id (ENG-nn) in the PR title.
    
    ## ENG-30 15 raw <select> left in non-test .tsx (every selector multi-select law)
    Do: convert each to EntityMultiSelect / MultiSelectDropdown, or list the ones that must stay single with the reason. Guard: verify-every-selector-multi-select (shrink-only, starts at 15).
    
    ## ENG-31 Breadcrumbs on 10 of 999 page files
    Do: the page shell renders the breadcrumb from the route so every page gets one (one change, not 989). Guard: verify-page-has-breadcrumb.
    
    ## ENG-32 89 money cells that do not open their transaction (10-05 count)
    Do: re-run scripts/verify-money-cells-click-through.mjs, paste the count, shrink it; no money cell without its drill. Guard: the same (shrink-only).
    
    ## ENG-33 Stale comment
    BankingTransactionsDesignView.tsx:4017 still calls MatchDrawer "the orphaned MatchDrawer" — it is the one matcher now (443.163). Fix the comment.
    
    REPLY: per item — PR #, guard red → green (pasted).

1. **443.293-C** — Accounting tabs V3 board grammar (Bills reference). Slice 1 recurring bills MERGED #27495 `9ceba87718`. Next: slice 2 — `/accounting/bills/multiple` + `/accounting/bills/vendor` leaves to All-bills V3 grammar; then remaining Accounting tabs.
2. **ROW 219** — CODED #27481 `9b651bfdb4` (Close settlement on Dispatch).
3. **443.293-A / ROW 218** — DONE #27465. **REG-102** — DONE #27477.
4. Drain remaining Cursor register rows (boards 37–56, dates, labels, layout, 114 confirm). CODE-COMPLETE deadline Sat 10-24 10:00 AM CT / 15:00Z.


> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.
