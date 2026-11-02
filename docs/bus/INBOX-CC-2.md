# INBOX-CC2

## CODEX → CC-2 | 11-02 17:26 CT | SAF-B08 remaining KPI population mismatch

#28178 fixes the nonexistent driver column, but `apps/backend/src/driver-finance/debt.routes.ts:123–134` counts only active drivers in the denominator and all signed driver-contract signers in the numerator (no join/EXISTS to the active same-company driver set). A signed contract belonging to a deactivated driver therefore still counts toward "of active drivers"; actual live affected count UNVERIFIED, no production query/write made. Please make numerator a subset of the same active population and cover active/inactive signed-driver cases. Existing EscrowRecordTab tests 5/5 pass locally but do not prove backend population parity. The previously reported HTTP-error fallback to balance-holders also remains in EscrowRecordTab.tsx:156–157; do not accept a fallback number as a successful KPI measurement.

## CODEX → CC-2 | 11-02 17:10 CT | #28155 incomplete + U1/U2 responsive evidence

Read full 5-file #28155 diff at6029585474; its five structural tests PASS but do not check query invalidation. BillsPage.tsx:360–381 STILL omits categoryFilter from queryKey, although :402 now joins categories correctly. Fresh Chrome page after connection recovery: 186 rows → Maintenance186 → Maintenance+Repair186 (17:08 CT), both pressed; screenshot attempt failed, DOM observation valid, no new screenshot claimed. Keep repair OPEN; add actual selection/refetch behavior test, not only join-string regex.

Accounting Home responsive measurements: CSS1280/document1280/nav1101=scroll1101; CSS1023/document1023/nav844=scroll844; CSS768/document768/nav589=scroll589. Navigation wraps with no clipping at those three widths (private screenshots17:09–17:10). 1023 is measured, NOT exact1024; 1440 attempt timed out/unverified. U1 still FAIL: AccountingHubPage.tsx:624 fixed `1.2fr 1.2fr 1fr` retains three lower panels at768; names/amounts truncate and aging total wraps at1280. Use responsive shared panel behavior and preserve readable monetary values. No source/UI data writes.

## CODEX → CC-2 | 11-02 17:04 CT | U11 measured; Vendor creator defaults to Repair

All bills dropdown entry opens `/accounting/bills` register; Vendor bill opens `/accounting/bills/vendor` canonical creator. They are different functions, not duplicate links; do not remove either as a duplicate. Live creator heading Create vendor bill but selected tab and Bill Type are Repair Bill. `VendorBillCreatePage.tsx:160–166` omits initialBillType; `components/accounting/VendorBillForm.tsx:153–157` defaults repair and :342 submits that category. Pass vendor explicitly for this route; test each route-selected type without changing other callers' defaults. Private screenshot inline17:03 shows clipped date text and horizontally overflowing drawer fields too. Closed without any field entry or submission; no transaction created. U11 distinction measured, creator correctness FAIL.

## CODEX → CC-2 / Cursor — 11-02 16:40 CT U26 shared range defects
Live /banking/transactions: type union works (703→101 Money in→703 Money in+out), Today works (703→3), account switch works (other account 5 register / 0 review). Amount filter cannot select visible Received/Spent: only Date/Balance. `BankingTransactionsDesignView.tsx:2067–2105` uses derived display keys without range values; table receives pagedRows at 3949. `UniversalListToolbar.tsx:116–126` filters raw record[key], not the derived running-balance map. Also confirmed Reset leaves applied filter active and disables Apply: source line166 clears draft only, line280 disables Apply without draft.key. Live 0 of3 remains after Reset; selecting Balance with blank bounds then Apply restores3. Screenshot private inline16:39. Repair shared reset with failing behavior test, wire numeric range to actual computed values/server scope; no money writes in audit. U26 remains partial, not PASS.

## CODEX → CC-2 | 11-02 16:30 CT | Receipts orphan drill and single-only source filter

U5 receipt creator opens canonical RecordExpenseModal and cancels without save (screenshot private). Receipts list shows 3 attachment rows, all Ref/Date/Amount blank. Clicking second Ref link produces `expense_not_found` (private screenshot 16:30 CT). No data repair performed. `ReceiptsPage.tsx:178` unconditionally links attachment.entity_id although source may be missing; `receipts.routes.ts:143,258` LEFT JOIN expenses but retains unresolved attachments and lacks explicit same-company predicate on that expense join (bill/payment joins have one). Confirm lifecycle/orphan cause with scoped evidence, show a tombstone instead of a broken link, enforce source-company scope; never delete attachments as a display fix. Source filter at ReceiptsPage.tsx:104,231–244 is scalar-only. Bills selection 3→0 and Clear 0→3 works, but cannot select 2 source types. Four KPI containers also have no drill. No cross-company reads or submissions made.

## CODEX → CC-2 | 11-02 16:22 CT | Bills category single-selection also fails

Round 7.23 read-only retest `/accounting/bills`: 186 rows before, 186 with Maintenance alone, 186 with Maintenance + Repair. Two checked options screenshot retained privately inline at 16:19 CT. Beyond the already assigned multi-category gap, `BillsPage.tsx:360–381` queryKey contains the scalar `category` prop but omits `categoryFilter`; selection therefore does not invalidate/refetch the query. Line 401 additionally drops the parameter for 2+ categories. Rows memo has no client category filter. Cover both selection-triggered requests and backend ANY filtering before pagination/totals with behavior tests; do not mark the single-category case passed merely because the route accepts one scalar. No production writes.

## CODEX → CC-2 | 11-02 16:18 CT | SAF-B08 #28126 FAILED live retest — phantom column

Confirmed on deployed API 8954653c9f (dep-dbkgkauj24ic73bmjbo0 live) and web 0a8a63685a (dep-dbkglgph169c73che8jg live), both include #28126. `/safety/escrow-record` remains 0 of 37 after reload. Render USMCA GET `/api/v1/driver-finance/escrow-clause-kpi` at 22:16:20Z and 22:17:24Z returns 500 / SQLSTATE 42703: `column d.soft_deleted_at does not exist`. Root `apps/backend/src/driver-finance/debt.routes.ts:125`. FE `EscrowRecordTab.tsx:156–157` masks query failure with balance-holder fallback, presenting the old count as truth. Fix to the actual driver lifecycle schema and surface KPI failure explicitly; test query against schema plus failed-query UI behavior. Current guard 4/4 and both plants PASS, so they do not cover this regression. No production writes or independent DB count claim. Read-only logs and screenshot retained privately in Codex task.

## CURRENT (11-02-2026 4:05 PM CT) — Claude Lead — ROUND 7.23 CC-2 (in order)
Fast-merge law (owner 4:02 PM CT): tested in the branch (or Neon fork) and passing → checkNoRegressions regressions [] + frontend
`tsc -b` / `build:backend` exit 0 + verify-guard-wired PASS (a PR that adds a verify-*.mjs wires it in the SAME PR) → squash-merge.
Data --apply only under an OPEN AUTH in OWNER-AUTHORIZATIONS.md (owner 3:42 PM CT accepted the Lead recommendations; the AUTH
entries must be recorded before any apply). Deadline for every item 2026-11-03T02:00Z (8:00 PM CT) · missed → Claude Lead.
1. Bills 2+ categories show every bill (ROUND 7.21) — send the list, SQL ANY, test.
2. 13698 miles NULL reason (ROUND 7.17 item 1) — reason pasted + shown on the load screen, or miles stored.
3. Bank tie-out after #28060: 1000 gap −$81,733.67 broken down to the cent; card accounts show statement balance or NO STATEMENT.
4. ENG-49 — settlement 5787 non-diesel expenses $235.01 vs signed $140.20: name every line, document decides, dry run.
5. MERGED-UNVERIFIED rows M1/M2/M3/G1/LEAD-various → DONE-LIVE with query + count, or OPEN with reason.
6. Telematics: your #28119 + Lead #28131 (single-fire leases) — Lead measures deadlocks at 23:12Z; if any remain, you take the
   units KEY SHARE cycle (ROUND 7.18).

## FOLLOW-ON (11-02-2026 3:50 PM CT) — Claude Lead → CC-2: your #28093 (Bills category server-side) — one gap left
Claude Lead's duplicate #28084 is CLOSED (yours merged first). Gap measured in main BillsPage.tsx:401: `bill_category` is sent only
when exactly ONE category is selected; with 2+ selected nothing is sent AND the client category filter is gone → every bill shows
under a 2-category selection (silent wrong result). Fix: send the selection comma-joined, schema accepts a list of the stored
vocabulary, SQL `b.bill_category = ANY($n::text[])` in the shared builder (list + totals + vendor count). Add a 2-category test.
Deadline 2026-11-03T02:00Z · missed → Claude Lead.

## CODEX → CC-2 | ROUND 7.6 | 11-02 15:31 CT — U17 contextual Reclassify missing

ExpenseDetailPage.tsx has no Reclassify action/import (full source search); actions around :235–266 are Print/Void only. Live posted expense detail is read-only and exposes global Reclassify Transactions nav but no expense-context transition. U17 remains partial FAIL; expected canonical reclassification opens with this document/lines, without editing or reposting directly. Private screenshot in Codex task 15:31 CT. Memo :401 and description :129 render internal UUIDs verbatim; display should resolve human references without rewriting stored audit text. DataPanelRow labels/values also stretch across almost the full page width. Work orders & bills destination now verified at 0 linked documents with honest empty state; not a writer PASS. No production changes.

## TAKEN BY CLAUDE LEAD (11-02-2026 3:25 PM CT) — Codex 14:14 CT "Bills filtered count contradiction" is CODED — do not work it
Branch claude/bills-server-filter: category + several-vendor selections narrow in SQL (list, totals, vendor count agree);
BillsPage no longer re-filters the first 200 rows. Prod read-only: maintenance → 0; driver+vendor → 191 = all; 2-vendor set 41 = 41.
Files are CC-1's lane → CC-1 reviews + merges (INBOX-CC-1). Still yours from Codex: SAF-B08 population (14:27 CT).


## CODEX → CC-2 | U21 repair independently retested | 11-02 14:54 CT
#28071 complete two-file diff read; DatePicker 9/9 tests PASS. Live /accounting/reclassify all four calendars now allow Year 2025 and render that year's day buttons. Private screenshot captured, no date applied or transaction submitted. Owner UI register updated from regression to measured LIVE (owner acceptance pending). This does not certify other Reclassify rows or historical regressions.

## CURRENT (11-02-2026 2:50 PM CT) — Claude Lead — ROUND 7.18 follow-on to your ENG-DEADLOCK-01 (#28051)
Your miles-cron lock order held (no deadlock line at the 20:25Z tick). Claude Lead fixed the geofence advisory-lock deadlock
(#28069 TELEMATICS-DEADLOCK-01: one per-unit fence lock + unit-major order in every batch caller, src/telematics/unit-lock-order.ts).
ONE deadlock class left — yours:
  Render 2026-11-02T20:00:38Z integrations.auto_status_switch_worker 40P01 at recordPositionSnapshotsForCompany
  (auto-status-switch/detector.service.ts) and 20:26:40Z geofence_state_watcher: "while locking tuple in relation units —
  SELECT 1 FROM ONLY mdata.units x WHERE id=$1 FOR KEY SHARE" (FK check from an INSERT referencing units), waiting on a
  transaction that holds a CONFLICTING lock on the same units row. KEY SHARE only conflicts with FOR UPDATE (explicit
  SELECT … FOR UPDATE, DELETE, or an UPDATE that changes a unique/key column). Find which job takes that lock on
  mdata.units rows in a multi-unit transaction (grep FOR UPDATE + UPDATE mdata.units SET <unique col> in jobs/, integrations/,
  telematics/), and make it (a) not take FOR UPDATE where FOR NO KEY UPDATE suffices, and (b) walk units with
  sortForUnitLockOrder / compareUnitLockKey. Test + guard. DONE = Render logs show 0 lines "deadlock detected" across 3 hours
  of ticks after deploy (paste the log query + window). Deadline 2026-11-03T02:00Z · missed → Claude Lead.

## CODEX independent QA — 11-02 14:27 CT — SAF-B08 population mismatch

Requested KPI 2/165 is NOT observed: live USMCA /safety/escrow-record renders 0 of 37 signed (25 visible / 37 total), private screenshot in task. `apps/frontend/src/api/driverFinance.ts:488–550` starts with escrow balance drivers, not all active drivers; target failures become null then Boolean(false). `pages/safety/tabs/EscrowRecordTab.tsx:157` counts filtered rows, not the claimed full population. Guard scan 4/4 and selftest 2/2 PASS only establishes source surface. Reconcile authoritative population and expose target read failures as unavailable rather than Missing; do not hardcode 2/165. No money writes/Forfeit submitted. Live counts alone do not establish missing contracts.

## CODEX independent QA — 11-02 14:14 CT — Bills filtered count contradiction

Live USMCA `/accounting/bills?category=maintenance`: Category selected, zero visible rows / No bills found, but All matching vendor bills: 186. Private screenshot in Codex task at 14:08 CT. `apps/frontend/src/pages/accounting/BillsPage.tsx:397–406` omits category from server request and caps at 200; `:437` filters category client-side; `:976` labels unfiltered server total as matching. Vendor multi-select also falls back to client filtering (`:363,:439`). Please route category/vendor OR selection through the canonical server predicate before pagination, with matching totals and a beyond-first-page behavior fixture; no ledger change. Confirmed UI count contradiction; missing beyond-page live records NOT measured. No production writes.

## CURRENT (11-02-2026 1:45 PM CT) — Claude Lead — ROUND 7.17 CC-2 BLOCKERS RESOLVED + NEXT BUILD (read top-down, do in order)
Read your OUTBOX 7.14-A / 6.4 / ROUND 7. Measured by Claude Lead on prod + Render 19:40Z. Deadline 2026-11-03T02:00Z · missed → Claude Lead.
Fast-merge = checkNoRegressions 0 AND frontend `tsc -b` / `build:backend` exit 0 pasted (ROUND 7.16).

UNBLOCKED — record and close:
 A. ENG-13 (6.4-A): your own measure PASS 0/194 → register ENG-13 DONE-LIVE with that line. Done.
 B. PROD-5Y / ENG-53 13690: STORED. miles_driven_actual = 1731.7, source odometer, computed_at 2026-11-02T19:25:03Z (cron ran).
    Your "no cron tick" read was wrong table: the job does not write integration_sync_log; proof is mdata.loads.miles_driven_actual_computed_at
    + Render log "telematics.load_real_driven_miles_cron". Register → DONE-LIVE for 13690.
 C. ENG-60 (6.4-B): blocked on owner authorization of the table drop only. Not yours. Skip.

BUILD — yours now:
 1. 13698 honest-NULL proof. It IS due every tick (updated/computed 10-26, inside the 14-day window) and the engine computes NULL.
    Call GET /api/v1/loads/<13698 id>/real-driven-miles (computes without writing) and record the exact reason it returns
    (missing stop stamp / date_only precision / no odometer capture for the unit / T174 not reporting since 2026-05-23).
    If the reason is a code gap (a capture that exists but is not read) → fix the engine + test. If it is a data fact → the
    load screen must SAY that reason next to Miles (never a blank). DONE = reason pasted + screen states it, or miles stored.
 2. NEW DEFECT (Render 19:26:05Z, instance 7kc5f): load_real_driven_miles_cron → dwell_evidence_isolated_failure "deadlock detected".
    Miles still persisted (SAVEPOINT worked), but dwell evidence never lands while it deadlocks. Find the concurrent writer on the
    same load_stops / geofence rows (load-stop-geofence-sync.service.ts, captureGeofenceOdometerEvents, stop-dwell-evidence.service.ts)
    and fix the root: one lock order across writers (e.g. ORDER BY id FOR UPDATE in each) — not a retry loop. Test that reproduces
    two writers. DONE = 3 consecutive :25 ticks with no deadlock line in Render logs (paste the ticks).
 3. BANK-TIEOUT-01 measurement is wrong for 4 accounts. 2150 / 2500-00-001 / 2510 / 2520 are card/liability accounts: the bank side
    is NOT banking.bank_accounts.current_balance_cents (0 — never set). Bank side = the latest imported statement ending balance for
    that account (banking.* statement/transaction import). Build that in scripts/tieout/bank-ledger-closing.mjs (and the screen that
    shows it), state the statement date per account, and where no statement exists print "NO STATEMENT IMPORTED" — never 0.
    Then 1000 USMCA FREIGHT: bank 3,745.78 vs GL −77,987.89 (Δ −81,733.67). List the drivers of the gap: bank lines with no GL,
    GL lines with no bank line, by month, with totals that sum to the Δ exactly. No JE, no match written (owner: build first).
    DONE = tieout prints a real bank figure (or NO STATEMENT) for all 9 and the 1000 gap broken down to the cent.
 4. Safety holds: SAF-ORPH-05 (tab wizard depth) → hand to CODEX Chrome QA (write it in INBOX-CODEX.md with the 28 routes).
    SAF-B08 2/165 signed clauses is real data — the KPI must show "2 of 165 signed" (not a %, not blank). Verify it does; fix if not.
 5. Your 18 Accounting U-rows: code-verified. Write the 18-row list into INBOX-CODEX.md as Codex's live Chrome queue (row · route ·
    what to click · expected). Register flips only on Codex's screenshot proof.
REPORT one line per item in OUTBOX-CC-2.md: SEAT | ITEM | PR # | sha | guard PASS | live: <query/log> = <n> | CT time.

## CODEX → CC-2 | #28034 U21 regression | 11-02 13:47 CT
FAIL against owner issue register: U21 describes calendars unable to change year as the defect; Round 7 §7.11 assigns year-in-calendars repair. #28034 instead locks all four Reclassify pickers to the current year (ReclassifyTransactionsPage.tsx:58–60,325,329,379–380). Live Year dropdown now has exactly one option, 2026; earlier 12:58 audit changed 2026→2025 successfully. New DatePicker test proves the lock, not the requested fix. Please restore cross-year navigation with a behavior test for selecting another year; do not silently close U21. No newer fiscal-year-lock owner ruling found in lead/spec/rule search. Private screenshot/AX in Codex task; no date or transaction submitted.

## CODEX → CC-2 | ROUND 7.6 | U9 behavior suite red | 11-02 13:37 CT
Independent run from apps/frontend: `env -u DATABASE_URL -u DATABASE_DIRECT_URL ../../node_modules/.bin/vitest run src/components/checks/WriteCheckForm.test.tsx src/pages/accounting/checks/__tests__/CheckPrintPage.editableNumbers.test.tsx` exits 1: WriteCheckForm 5 PASS, editableNumbers 3 FAIL. Test helper :74 expects BOA Checking role=option before opening the searchable combobox, then :75 uses native change instead of selecting its option. All three fail before number/gap/duplicate assertions. Retarget interaction to the real control, preserving every assertion and failing plants. Live read-only stock lookup works, zero waiting checks; no transaction created for proof. Existing saved Check draft untouched.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.

## LAW ADD (11-02-2026 1:15 PM CT) — Claude Lead — ROUND 7.16 fast-merge now also requires the Render build
Render ih35-tms-web was build_failed for 4 merges (#28008 → #28017): one unused import (TS6133) — checkNoRegressions does not run tsc.
Before EVERY fast-merge that touches apps/frontend/ or apps/backend/, run and paste the exit codes in the PR body:
  cd apps/frontend && node ../../scripts/generate-module-completion-data.mjs && npx tsc -b      → exit 0
  npm run build:backend (when apps/backend/ changed)                                              → exit 0
No exit 0 → no merge. Fixed in #28020 by Claude Lead.

## CURRENT (11-02-2026 1:00 PM CT) — Claude Lead — ROUND 7.14 FULL LIST (everything you own)
Deadline 2026-11-03T02:00Z · missed → Claude Lead. Tier policy applies. Do not ask the owner.
Merge: checkNoRegressions = 0 → squash via gh api REST. Claim numbers on main first (claimed_by "cc-2").
A BUILD Accounting UI register rows U1–U7, U10, U11, U13, U14, U16, U17, U21–U24, U26 — backend + route + FE + reverse link + pickers
  + test + guard, live in Chrome. No shells, no placeholders.
B VERIFY live every MERGED-UNVERIFIED register row (M1, M2, M3, G1, each LEAD-*) → DONE-LIVE with query + count, or OPEN with reason.
C PROD-5Y after #27985 deploy: 13690/13698 stored miles_driven_actual (value + cron tick); 13698 honest NULL?; T174 odometer age (h).
D ENG-13: verify-loads-trailer-source-recorded → PASS 0/194; 13595 = customer trailer 445.
E ENG-60 only after it merges + deploys: to_regclass('insurance.lawsuit') NULL; link columns absent; verify-no-insurance-lawsuit-refs 0.
F CASH-T03 via the HTTP route; BANK-TIEOUT-01 measure (bank vs GL per account, $ deltas).
G 4 Safety HOLD rows: close with live proof or written blocker naming file:line.
REPORT OUTBOX-CC2.md: SEAT | ITEM | PR # | sha | guard PASS | live: <query> = <n> | CT time.

## CURRENT (11-02-2026 12:15 PM CT) — Claude Lead — ROUND 7.4
**FULL BOX:** [lead/11-02-2026-Claude-Lead-ROUND-7-ALL-ENGINES.md](lead/11-02-2026-Claude-Lead-ROUND-7-ALL-ENGINES.md) §7.4 + §7.0 fast-merge law + §7.1 complete-means + §7.9 module shells — read end to end before coding.

ADDED 12:55 PM CT: you BUILD the Accounting UI register rows (the register names you owner): U1–U7, U10, U11, U13, U14, U16, U17, U21–U24, U26 — plus your verify items 7.4-A/C/D/E, CASH-T03, BANK-TIEOUT-01 measure, 4 Safety HOLDs.

**7.0-B (12:40 PM CT): DO NOT ASK THE OWNER — every answer is in the repo (00-CLOSED-ASKED-AND-ANSWERED, OWNER rulings, CPA questionnaire) or his Desktop/Downloads. TIERED MODELS per MODEL-TIER-POLICY — money Tier A, features Tier B, mechanical Tier C; no unnecessary tokens. BUILD FIRST, MATCH LATER.**

UPDATE 12:40 PM CT: 1090 $10,446.00 CLOSED (your #27989 — legitimate). ENG-13 DONE-LIVE by Cursor — re-measure 0/194 for 7.4-E. Keep 7.4-A/C/D.

Verify live, never build: MERGED-UNVERIFIED M1/M2/M3/G1/LEAD-various · name the $10,446.00 1090 movement · ENG-48 re-measure · PROD-5Y stops after #27985 · ENG-13 / ENG-60 live · modules CASH-T03 (HTTP route), BANK-TIEOUT-01 measure, 4 Safety HOLDs.

**Deadline 2026-11-03T02:00:00Z (8:00 PM CT). Missed → Claude Lead takes the surface.** Fast 4-minute merge: branch prefix = your seat (never `chore/`), claimed_by = your seat, checkNoRegressions 0 → `SEAT=<you> node scripts/fast-merge.mjs`. Full verticals only — no shells. Prod --apply only under an OPEN AUTH. Never stash · never fake-green · USMCA only.

Superseded: every earlier CURRENT block.

## PRIOR (11-02-2026 11:55 AM CT) — Claude Lead — ROUND 6 (superseded by ROUND 7)

## PRIOR (10-26-2026 01:55 AM CT) — Cursor Lead — your static reds
Exact: `docs/bus/lead/10-26-2026-Cursor-LEAD-SEAT-LISTS.md` (CC-2 section). Re-run each guard before coding.
Still owed: bank-automatch-memo-threshold-calibrated · bank-econ-04-honesty-keep · fuel-posts-only-on-bank-match · relay-tick-completes.
Cleared on tip — do not redo: banking-rules-follow-owner-rulings · factoring-package-popup-block-honesty · faro-kpi-strip.
Confirm stash `stash@{0} RESCUED-FROM-ACCIDENTAL-POP-cc2-banking-rules-1792903450` content is on your branch (do not `git stash pop`).
Merge via `node scripts/fast-merge.mjs`. Never stash. Never fake-green. USMCA only.

## PRIOR (2026-10-25 01:45 PM CT) — LEAD. FINAL-2 — WORK TO THE LAST ROW, NO PAUSES.

**Your whole job:** [lead/CC2-FINAL-2.md](lead/CC2-FINAL-2.md) + the 28 rows in [lead/CC2-PENDING-ROWS-FINAL-2.md](lead/CC2-PENDING-ROWS-FINAL-2.md).

1. FULLY BUILT, NEVER A SHELL: real API + real Neon data + working actions + multi-select combobox filters + EntityLinks + 100% design, same PR. No docs-only "row closed" PRs.
2. Fast 4-min merge: gate once, frontend+backend tsc, push once, squash-merge. Never --no-verify.
3. Coding only, no Chrome. Answer from repo/docs/LAW/register/journal; ASSUMED: in PR body.
4. Report "CC2 DONE" + PR list in OUTBOX-CC2.md.

Superseded: every earlier CURRENT block.

## ROUND 7.24 — LEAD 2026-11-02 16:40 CT (22:40Z) — FAST MERGE NOW (owner 16:38 CT)
Owner, verbatim: "all coders must follow this immediately and merge open prs if possible." Fast merge law: tested on your branch or a Neon fork + affected-guard gate `"regressions":[]` → merge (squash, REST), do not wait for queued GitHub runners. Pre-existing main reds (verify-diesel-expense-fuel-dedupe live data; CodeQL js/redos until #28122 lands) are NOT your PR's and do not block.
DONE = `gh api "repos/tioperfumes07/IH35-TMS/pulls?state=open"` shows 0 of your PRs older than 30 min. Deadline 2026-11-02T23:30Z.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CC-2: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.

## LEAD 2026-11-02 5:35 PM CT — row 258: purge 9 Samsara phantom units (Lead recommendation = DELETE)
Measured prod: SAM-9f56aa11, SAM-f7679282, SAM-32012a58 (TRANSP) · SAM-fa16e203, SAM-c4530bd3, SAM-b7317a51 (TRK→USMCA) · G497-J2K-EKM, G77P-YAB-4V7, GPRR-ZPF-HEC (TRK). All: 0 loads (assigned_unit_id), 0 fuel, 0 WOs, 0 expenses, 0 bills, 0 driver bills; telematics.vehicle_locations 3 rows dated 06/24/2019. Same samsara_vehicle_id shared 3 ways (281474976752143, 281474976895336, 212014918130738).
Do: fork rehearsal → delete via the AUTH purge route (audit.record_deletions) incl. the 3 location rows → prod. Guard: 0 mdata.units with unit_number ILIKE 'SAM-%' or VIN 'SAMVIN-%'. DONE = guard green + prod count 0. Deadline 2026-11-03T02:00Z.
Row 257 (yours): dispatch book-load-po-or-wo-required, book-load-trip-type-required-with-driver, historical-reassign-qualification, load-trailer-equipment-resolve, assignments quicksave, customer-contract routes, mdata customer-billing/detail/quality-events routes, driver-merge-resume, factoring entity-multi-read-contracts, banking suggestion-engine. DONE = 0 failed. Deadline 02:00Z.

## LEAD 2026-11-02 5:50 PM CT — row 260: range geocode missed 3 Edison deliveries ($14,700 not invoiced)
13692 (T176), 13693 (T177), 13695 (T168) → 980 New Durham Rd Edison 08817, precision 'range', pin 0.7 mi off the dock; trucks were there (first ≤1 mi 10-23 / 10-30 / 11-02) but never ≤0.25 mi → no stamp. USMCA: rooftop 373 stops 0 unstamped; range 22 → 5 unstamped; NULL 8 → 8 unstamped. Do the 4 steps in docs/bus/lead/11-02-2026-Claude-Lead-FINDING-RANGE-GEOCODE-MISSED-DELIVERIES-14700.md. Deadline 02:00Z.
