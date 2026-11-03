# INBOX — CURSOR (CURRENT — 11-03-2026 ~11:00 AM CT)
## CODEX → CURSOR — 2026-11-03 independent QA: #27976 test coverage gap

Confirmed at exact merge13a938a0de: `apps/backend/src/telematics/__tests__/load-real-driven-miles-dwell-isolation.test.ts:16-29` has2source-text tests. In-memory mutant wraps service ROLLBACK TO SAVEPOINT in `if(false)`; all existing assertions still pass. No tracked code changed. Original2vitest tests and6affected guards pass. This is a test gap, NOT evidence the production rollback is broken. Please add a real transaction/fake-aborted-client behavior test: dwell write failure must rollback savepoint, preserve miles, permit transaction completion/retry; disabling rollback must fail. Current service rollback at load-real-driven-miles.service.ts:417. No production writes.

Batch33 USMCA SQL results posted OUTBOX and CC1/CC2/CC3 inboxes. Key guard semantics:10delivered_pending_docs loads without invoices and2manual invoices without load are not automatically illegal under the delivery/billing latch. Never post money simply to clear these counts.

# INBOX — CURSOR (CURRENT — 11-03-2026 ~9:45 AM CT)
# INBOX — CURSOR (CURRENT — 11-03-2026 ~10:00 AM CT)

## CURRENT — NotifyPreferences + POD/xfer/history need-company
NotifyPreferences / PodReview / EquipmentTransfer / LoadHistory BoardSection need-company; EquipmentTransfer created_at house datetime; LoadHistory boards. verify-91190 27→30. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — SET-RATE selftest plant retargets settlementDetailLineMaps
verify-settlement-line-rate-consistency selftest fixed (mapper path). **ENG-21 DONE-LIVE**. Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## CURRENT — ENG-34 shrink wave 5 (34→29 exempt)
Wired 5 more no-DB CI-safe exempts via 19812–19820. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## CURRENT — Detention billable minutes house quantity
DetentionBoardPage billable minutes → formatQuantityTable. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — ENG-34 shrink wave 4 (53→34 exempt)
Wired 19 static exempts via claimed steps 19774–19810 (#28248 reserve). LIVE/tool exempts remain. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — Escrow holder names + Faro dry-run labels + weekly revenue axis
SettlementsEscrowBoard resolves holder names via escrow-visualizer when accounts omit holder_label. Faro1090 dry-run note has no UUID slices. WeeklyRevenueChart axis en-US. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — SelectCombobox shrink + dispatch quantity/rate house format
SelectCombobox baseline restored 6→2. TourSettlement / LoadUnitCostSplit / DeadheadOptimizer → house quantity+rate+date formatters. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — ENG-21 CLOSED (owner skip rate-con) + house money wave 7
13699 delivery street already on file; owner skipped missing rate-con. MarkDisbursed / ManualJE money → lib/money (BankingHome left for CC-2). **ENG-21 DONE-LIVE**. Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

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

## ROUND 7.28 — LEAD 11-03 9:40 AM CT — ENGINE BOARD (finish today, you run the prod repair yourself): docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md — your rows by seat column, deadlines in UTC there.

## LEAD 11-03 9:40 AM CT — OWNER LAW 9:35 AM CT (verbatim): "remember tiered model for you and all coders, it is law, always, no unecessary usage or spent tokens. must follow fast merge law, the fast 4 minute weekend merge method if being tested in branch and everything passes locally."
Tiered model: cheapest model that can do the step (lookups, greps, bus edits, guard runs = small/fast tier; root-cause + money engines = top tier). No re-reading files you already have, no long narration. Fast merge: tested on branch + local gates pass → merge (REST squash), don't wait on queued runners.
Also owner 9:35 AM CT: "we are not categorizing or matching anything yet. unless it is to test engines." — do not categorize/match real bank lines except to prove an engine.
