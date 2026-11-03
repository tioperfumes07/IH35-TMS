## 2026-11-03 — ROUND7.27 batch34: diesel verifier and snapshot evidence

Batch33 published #28258 at362cbcc7cfa9f1965fceb68ed70fa757bcc9c05b; content independently located on origin/main. Docs-only, no runtime deployment claim. Latest user prohibition on production changes remains controlling.

| Item | Verdict | Fresh independent evidence | Owner |
|---|---|---|---|
|E3 diesel dedupe|PATCH-REJECTED as completion evidence|Actual live guard exit0; selftest17/17. Measured0 doubled expenses,316 live Diesel expenses,6 candidate duplicate pairs. #28167/13d6260988 raised ceilings272→316 and4→6. Today's engine board still requires pairs≤4; raised baseline is not repair. No judgment that every candidate is necessarily an economic duplicate without source review.|CC-1|
|E3 guard reporting|OPEN verifier defect|Live summary claims2/2 historical rows voided; independent scoped read finds0 existing and0 correctly voided. Purged rows may legitimately pass, but cannot be reported as2 observed voids. Source verify-diesel-expense-fuel-dedupe.mjs final success text is hardcoded.|CC-1|
|261/E8|OPEN|Live snapshot schema has7 columns, no projected_expense_cents.69 snapshots span2026-08-27 through2026-11-03. Source cash-flow.service.ts:645-663 recomputes expenses from current bills; historical override:682-700 reads income only. No historical expense-snapshot completion proof.|CC-1|
|170|DONE-LIVE bounded amount/count|Independent positive-open predicate confirms164 invoices, matching UI count and GL1100 amount in batch33. Sent183 is a different population, not a count defect.|Cursor|
|E2 linkage scope caveat|OPEN|All316 memo-prefix Diesel expenses have source_fuel_transaction_id populated. This does NOT certify Relay receipt expense population with other memo shapes or close E2's90 unlinked claim.|CC-1|

Database identity neondb/expected production branch, transaction_read_only=on, JE control3264. Private reports: Downloads/codex-round7-readonly-measurements-phase4.json; codex-round7-diesel-live.log and codex-round7-diesel-selftest.log. No data modified. Full263-row/249-PR audit remains incomplete; this is bounded evidence, not blanket PASS.

## 2026-11-03 — ROUND7.27 batch33: independent USMCA live checks and historical review

Read-only production branch asserted before each connection; all measurements use explicit USMCA predicates and READ ONLY transactions. No writes, repairs, matches, categorization, flags, imports, or exports. Private reproducible runner/results: Downloads/codex-round7-readonly-measurements.cjs and its three JSON reports; raw monetary evidence stays outside the public repo. Independent USMCA JE control=3264. This batch does NOT complete the 263-row/249-PR audit.

Follow-up live UI at09:57CT: Accounting A/R tile amount equals freshly measured GL1100; UI164 positive-balance open invoices is not the183 sent-invoice population. Row170 amount parity DONE-LIVE for this scope. Captured inline private screenshots at1280x900 and768x900 (including lower panels after scroll). Viewport control now available; older missing-width evidence is not retroactively filled. At1280 receivables amounts truncate and total wraps; at768 unconditional three-column lower grid truncates names and forces inner-table horizontal scroll. Root layout at AccountingHubPage.tsx:621-627 uses fixed1.2fr1.2fr1fr without breakpoint. Aging currency symbols now present; earlier missing-currency observation no longer holds on this live screen. Screen-wide typography and all drill paths not certified. No screenshots committed.

| Item | Verdict | Independent evidence / limitation | Owner |
|---|---|---|---|
|ACCT-TIEOUT-01|PARTIAL|8125 posting rows, debit-credit difference=0 under the existing USMCA leg's predicate. TRANSP comparison deliberately not run; full script not marked PASS.|CC-2|
|VEND-TIEOUT-01|PASS|Actual auto_check exits0,184 open TMS bills; AP aging equals credit-normalized AP control, variance0. Session default_transaction_read_only=on.|CC-2|
|BANK-TIEOUT-01|OPEN|Scoped equivalent:9 accounts,3 imported-transaction populations and3 nonzero bank-vs-GL differences;6 without imported transactions are unverified, not zero balances. Import sums are not independently sourced ending statements; do not repair from these differences alone.|CC-2|
|DISP-TIEOUT-01|OPEN|Uncapped counts:191 delivered-status loads,183 active TMS invoices,10 loads without invoices,2 invoices without a delivered load. All10 loads are delivered_pending_docs; both invoices are manual with null source_load_id. Check conflicts with delivery-versus-billing latch/manual-invoice scope; not proof10 invoices must be created.|CC-2/Cursor|
|FACT-TIEOUT-01|OPEN|Marker cohort0, rechecked against243 USMCA invoices and57 with advance link. Marker-specific zero is not no factoring activity. Historical33-invoice source mapping needs revalidation.|CC-2|
|SETL-TIEOUT-01|OPEN|WO lookup0, but numeric loads13512/13513 BOTH exist and have7 active settlement lines. Both WO fields are null. Current checker falsely diagnoses nonexistent loads; amount/linkage acceptance not certified.|CC-1|
|170|OPEN, DB half PASS|183 sent invoices' open balance equals GL1100 exactly. Prior UI evidence is not a new same-time UI measurement; fresh screen parity remains owed.|CC-2|
|162/E1|OPEN|281 active Relay fills,262 without matched_driver_id,42 without matched_unit_id.|CC-3|
|260/E5|OPEN|13692/13695 dispatched,13693 assigned_not_dispatched. No status/geofence repair attempted.|CC-2|
|258/E6|OPEN, scope bounded|42 USMCA-owned/leased units,3 SAM- units. Did not inspect TRANSP/TRK phantom populations.|CC-2|
|259|OPEN, prior UI bound only|Earlier maintenance exclusion is not source cleanup:3 USMCA SAM- rows remain. No fresh maintenance screen in this batch.|LEAD|
|119/E12|OWNER-DECISION remains|24 USMCA periods open. No month locked or chosen.|OWNER|
|ENG-29/E11|OPEN|194 active nonvoid/noncancelled loads,46 populated miles,148 missing. Broader198 historical denominator not substituted.|CC-3|
|443.213 settlement void consistency|PASS for USMCA invariant|122 rows,0 inconsistent,0 cancelled without reversed_at. USMCA constraint validated=true.|CC-1|
|443.213 driver bill void consistency|PASS for USMCA invariant|209 rows,0 inconsistent. USMCA constraint validated=true; separate older global NOT VALID constraint does not invalidate this scoped proof.|CC-1|
|SAF-ORPH-01|OPEN runtime|Live trigger only validates posting types; stored-balance delta retired.0 forfeitures; cannot claim observed forfeiture economics.|CC-1|
|SAF-ORPH-02|OPEN runtime|Accounting62 escrow events (60deposit/2release),driver history62 (60hold/2release),0 forfeits. Count agreement is not per-event monetary proof.|CC-1|
|SAF-B08|OPEN|No auto_check registered; forfeiture population0. Existing HOLD not promoted.|CC-1|
|SAF-ORPH-05|OPEN|No auto_check registered; full Safety click-through not completed.|CC-3|
|ACCT-R-04|OPEN|No auto_check registered; no deploy smoke run in this batch.|CC-2|
|VEND-CERT-01|OPEN|No auto_check registered; current responsive/drill-through certification still owed.|CC-3|
|CASH-T03|OPEN|No auto_check registered; rolling ledger runtime not re-certified by SQL totals.|CC-1|

Screenshot=N/A for all above: these are database/source checks, not visual proof. Reconciliation query returned0 current nonvoid sessions; no zero-variance completion claim made.

Historical exact-merge reviews (not current-main guard runs): #27969 c5e8f9e4b full3-file diff; guard selftest3/3,1 affected static pass/1 live exclusion; shrink182→149 honest, live coverage incomplete. #27970 4c8a5b7a5d, #27972 455064fedf, #27973 aafee241cf full docs diffs,2 affected guards each pass. #27976 13a938a0de full6-file diff,6 affected guards pass,2 vitest tests pass BUT in-memory mutation disables ROLLBACK TO SAVEPOINT while every test assertion still passes: confirmed coverage gap, not proof production rollback fails. Sent to Cursor. #27974 has no merge commit, excluded from merged-PR scope. No static exclusion counted as PASS.

### Connection restoration and initial measurement

Official Neon CLI authentication succeeds. Repository branch assertion independently resolves the configured endpoint to production `br-fancy-credit-akjnd07a`; database identity is `neondb`, and transaction_read_only is on. No database writes. Chat plugin tools remain unavailable; this is an authenticated CLI/configured-connection path, not proof the plugin recovered.

ENG-29 / E11 remains OPEN: independently measured 194 active USMCA loads, 148 missing miles_driven_actual, 46 populated. Population predicate: company id = USMCA, voided_at IS NULL, status NOT IN ('cancelled','voided'). Read-only transaction rolled back. This confirms the current guard population, not the broader 198-load historical denominator or completion for every delivered load with GPS. Owner: CC-3. Screenshot: N/A, SQL evidence.

BANK-TIEOUT-01 scope review: its bank_stmt CTE aggregates banking.bank_transactions without an explicit company predicate before the final company-scoped join. Did not execute that unmodified query across frozen companies. Independent USMCA-only tie-out remains pending; this is not a measured monetary variance.

## 2026-11-03 — ROUND7.27 batch32: independent remeasurement on c5e98b4882

Scope263 rows. GitHub merged-date inventory returns249 PRs, NOT249 reviewed diffs. No production writes.25 targeted scans +25 selftests +2 tie-out selftests exit0;2 optional fuel LIVE phases explicitly skipped without DATABASE_URL. Strict artifact check separately exits1. Source checks below are not whole-workflow passes. Screenshot N/A means source-only evidence, not missing evidence disguised as a screenshot.

| Row | Verdict | Measured result | Screenshot / owner if OPEN |
|---|---|---|---|
|15|OPEN|entity-filters-multi-select:1575 files,134/134 compliant,0 failures/skips; selftest50/50. Every live picker not exercised.|N/A; LEAD|
|31|OPEN|export-business-date scan0/13 plants; no-selftest-mutates scan0 with10 existing call sites/baseline10; filter-panels scan0/27 plants. Full push gate not run.|N/A; LEAD|
|32|OPEN|cc1-money-orphan-guard-registry scan0/2 plants,85 guards/orphan0 reported; child execution capture not repeated.|N/A; LEAD|
|36|OPEN|bank-match-combinations scan0/12 plants; no live match created.|N/A; LEAD|
|37|OPEN|same guard statically covers loan branch; independent purchase-plus-loan population proof absent.|N/A; LEAD|
|39|OPEN|reports-home-filter-leaf-ownership, reports-home-no-box-in-box, rpt-s01-s05-reports-home-ifta scans/selftests all0; entire heavy CI not rerun.|N/A; LEAD|
|42|OPEN|legal-matter-lawsuit-linkage scan0/8 plants; populated reverse relation still unverified.|Private inline earlier redirect proof; LEAD|
|108|DONE-LIVE|Requested documentary records exist: OWNER-AUTHORIZATIONS.md AUTH-461:8066 and AUTH-462:8076 with result entries. Documentary existence only, not fresh production-count verification.|N/A documentary scope|
|136|DONE-LIVE|Freshness reads live=c5e98b4; scoreboard stamp checked1/fresh1/stale0. Other artifacts separately fail strict below.|N/A machine output|
|144|OPEN|PL scan0/7 plants; recurring-worker0/11; unmatched-alert0/8; no-hard-delete-bank-stubs0/15 planted findings; match-posts-nothing0/7; reefer0/2; IFTA0/5. Fuel LIVE phases skipped; AP and trigger counts unverified.|N/A; LEAD|
|175|OPEN|resettlement-origin-load-dates scan0/selftest19/19; live parity not certified.|N/A; CC-3|
|176|OPEN|entity-label-rejects-uuid-shaped-name scan/selftest0; not full live label census.|N/A; CC-3|
|177|OPEN|board-page-no-legacy-sections scan0,0 findings,selftest10/10; bounded source contract not full board acceptance.|N/A; Codex|
|178|DUPLICATE-OF #15|Same named134-filter guard population.|N/A|
|140|DUPLICATE-OF #120|Register repeats M1 account-scoping requirement; canonical120 remains open.|N/A|
|141|DUPLICATE-OF #121|Register repeats M2 invoice/Faro union; canonical121 remains open.|N/A|
|142|DUPLICATE-OF #122|Register repeats M3/M5 shared matcher; canonical122 remains open.|N/A|
|123|DUPLICATE-OF #144|Same seven accounting-control requirements; canonical144 still needs live proof.|N/A|
|165|OPEN|fleet-health-no-false-ok scan0/6 plants; production WO count/MTD not independently queried.|N/A; CC-2|
|259|OPEN|Same6 plants; prior39-row/no-SAM live sample retained. UI exclusion alone cannot close phantom-data258.|Private inline batch30; LEAD|
|260|OPEN|Current load13692 drawer: Dispatched,0/2 stops geofenced, invoice action disabled/no linked invoice; driven miles unavailable with missing geofence/dwell reason. Only1of3 inspected, no GPS diagnosis inferred.|Private inline current task; CC-2|

Artifact evidence: normal freshness exits0 with3 UNVERIFIABLE HERE outcomes. Explicit --strict exits1:2 stale outputs (financial-block-buildability.md/csv pair; USMCA-EXHAUSTIVE-BATTERY.md) plus canonical-relations.json requiring DB. Selftest28/28. No generator, baseline or guard changed. Lead to route stale outputs; not a new register. UI ratchet scan/selftest0; worklist off-scale raw0/semantic0, NOT all-style-debt zero.

13 module rows re-inventoried:6 explicit auto_check,7 absent. BANK-TIEOUT-01 selftest0; FACT-TIEOUT-01 selftest4/4. SAF-ORPH-01 sign-delta and SAF-ORPH-02 split-ledger static/selftests0 with optional DSNs unset: no money fixture. ACCT-TIEOUT-01 prior explicit TRANSP leg prevents unreviewed production execution. Live acceptance for all13 remains unverified; HOLD/FAIL states preserved.

Remaining: prior Neon connector authentication blocker unresolved; no alternate credential extraction/bypass. Documented browser resize/screenshot-file export not established;1280/768 and filesystem screenshot paths owed, captures private inline only. Full263-row coverage,249 historical PR reviews and live tie-outs NOT COMPLETE.

- 16:24 CT #28073 posted fuel expense opened through Fleet reverse link: journal and proof trail both render 2 postings, debit/credit difference 0; proof trail JE link navigates to journal detail. Narrow rendering repair PASS, not independent certification of the whole adopted-expense population. Same JE link displays two different dates: upper summary 10/02/2026, Journal panel 10/03/2026; requires serialization/date diagnosis, no money edit. Screenshots private inline.
- 16:25 CT journal destination opens and shows reverse Expense link, 2 postings and difference 0; header date 10/03/2026. #28129 current-tip isolated query-arity tests 2/2 PASS (production DB disabled); historical full-PR guard audit still pending.
- 16:26 CT U14 `/accounting/maintenance-shop`: Work orders & bills label and columns render; 0 linked documents. Screenshot captured privately. Label/routing observed, nonempty workflow and reverse-document coverage UNVERIFIED, not a population PASS.

16:16 CT batch 20: #28139 merged 52e610a1c74bb6db0a02fea7d8f140563c4dc0f8 after preserving concurrent Lead bus entry and rerunning 3 affected guards with 0 regressions. Attachment attempted, refused by app 100-identity limit. Round 7.23 read; priority moves to escrow KPI, Bills categories, fuel proof trail and Fleet Telematics retests.
- SAF-B08 #28126 live retest FAIL 16:18 CT: still 0 of 37 after reload. Deployed API 8954653c9f / web 0a8a63685a contain repair. Scoped endpoint logs prove HTTP 500 / 42703 `column d.soft_deleted_at does not exist`, debt.routes.ts:125. FE fallback hides failure. Guard 4/4 and selftest 2 plants PASS but do not catch query/schema failure. Filed CC-2 with exact route, line and logs. Expected 2/165 not independently re-measured; never forced to target number.
- Safety route continuation: Driver Scoring week and quarter both 0 rows (quarter selection visibly active); CSA Score 7 history rows and missing public metrics explicitly unavailable; DOT Compliance medical cards/background checks/reminders all 0. Both medical-card and MVR creators open canonical drawers, date calendars and driver selectors, then cancelled without save. No empty-population acceptance.
- CSA Mitigation 0 open actions; CSA/FMCSA Trend missing/stale public source, 7 unknown categories, no source pull triggered. Safety Events 1 open row; View opens details, list date formatted but detail Occurred raw timestamp. `SafetyEventsPage.tsx:628`; screenshot private inline 16:16 CT. No event edits. Remaining route coverage, screenshots on some inspected empty pages and reverse-depth checks still incomplete.

16:10 CT Safety depth continuation (read-only USMCA):
- DOT Inspections: 0 inspections, 67 open dwell events / 20 visible; raw SQL timestamps including fractional seconds and +00 violate display contract. Same Cursor handoff extended; no Mark Reviewed/Citation/Clean action. Screenshot 16:11 CT.
- Safety Meetings: 0 rows; Create opens date/calendar, topic and searchable attendee picker; Cancel closes without save. HOS: 11 loaded drivers; HOS Violations: 0 rows, inline creator untouched. Empty populations are not behavioral/engine passes.
- IDVR: 237 submissions, page 1 of 5 with 50 rows. Driver/unit links render, calendar filters and settings present. FAIL submitted-date display: ISO year-first time rather than Central MM/DD/YYYY; source `IdvrPage.tsx:98`, companion detail formatter `IdvrDetailPage.tsx:91`. Private inline screenshot 16:10 CT. No correction/WO action submitted. Remaining Safety routes/deeper drills still pending.

16:05 CT batch 19: batch 18 merged #28133 1d1e9f18baae097f5184518918e6f18391a0fc1e, 3 affected guards / 0 regressions; attachment refused by app 100-identity limit. No prior attachment removed.

- #28080 confirmed behavioral regression despite static checks: missing-arrival gap producer emits epoch; LoadHistory formatWhen formerly displayed em dash, now actual formatter returns 12/31/1969, 6:00 PM. Producer line 321, consumer lines 22–24. Filed Cursor with reproducible input/output; live affected count UNVERIFIED.
- UI design ratchet on 1d1e9f18ba: PASS and selftest PASS; raw font-size occurrences 128 (baseline 129), off-scale raw/semantic sizes 0, trapping-picker count 0. No baseline changed. Guard pass does not certify all visual attributes.
- SAF-ORPH-05 partial route coverage: Driver Files loaded 11 active rows, dates MM/DD/YYYY, linked names/records, screenshot captured 16:03 CT. Drug & Alcohol loaded 1 consortium enrollment and 1 draw-history row; random pool/queries/positive queue display empty states. Schedule and manual draw not submitted. Remaining 26 routes and deeper behavior not certified.

15:58 CT batch 18 in progress: batch 17 merged #28125 c8be30c7688a47ae769a67743ac5ac387518a775. No application or production changes.

| PR / surface | Guard | Selftest / historical regression | Live re-measure | Verdict |
|---|---|---|---|---|
| #28080 6fe9e43a23 | Datetime guard PASS; full 10-file diff read | 128 selected: 123 PASS, 2 failures identical on parent 29581b30c5, 3 live exclusions. Failures: deadhead-pay selftest missing mutation target; live-document predicate inline debt | Full changed-surface coverage pending | Local checked, live UNVERIFIED |
| #28081 49986f6d1c | Dispatch datetime wave2 PASS; full 6-file diff read | Selftest PASS; 38/38 historical checks PASS. Selftest checks a string mutation rather than invoking the whole checker | Remaining changed surfaces pending | Local checked, live UNVERIFIED |
| #28091 debtor filtering | Previously recorded guard gap and 2000-line cap risk remain | No new production tests | Live: 57 invoices unfiltered; Semares 5; add Armstrong gives 10 invoices / 7 purchases; summary 7 rows. Two selected debtor chips visible; private inline screenshot 15:53 CT | Selected two-debtor union PASS, population completeness unverified |
| Fuel Home | Existing error-as-empty defect reconfirmed | No import, refresh-write, or money submission | 15:58 CT: four fill KPIs unavailable, error banner and No diesel spend displayed together; screenshot inline | FAIL; existing Cursor handoff remains open |

Private historical logs: Downloads/codex-round7-28080-historical.log and codex-round7-28081-historical.log. Excluded live checks are not passes. Full audit remains incomplete.

16:01 CT additional batch 18 measurements:
- #28082 750b87ad8a: full 5-file diff read; datetime guard and selftest PASS. Historical 97 selected: 95 PASS, 1 DATABASE_URL-not-set failure (driver-profile-linkage), 1 live exclusion. No live population certification. Selftest only checks a replaced token, not the complete checker.
- #28092 d9c5fe5004: both files read; Relay date/currency guard + selftest PASS; historical 7/7 PASS; formatter behavior tests 15/15 PASS at merge. Live Relay inbox: 126 deposit rows, first 25 show MM/DD/YYYY and dollar sign/comma/two-decimal amounts. No classification or card action submitted. Targeted display PASS, accounting tieout not performed.
- #28092 guard integrity: executing its actual audit function against an in-memory fixture replacing all 3 formatUsdCents calls with String leaves 0 failures. Import survives and satisfies the guard. Confirmed missing currency-render enforcement; no application file modified.
- Relay wallet renders 46 day rows; individual amount drill-through and totals tieout remain pending. Six KPI tiles lack click handlers in source lines 98–135 and are static containers in live AX. Currency reference table render at lines 74–75 is plain text rather than EntityLink; downstream drill requires further live check.
- Follow-up 16:01 CT: first deposit drill opens 1 reference row, matching the clicked amount; reference/amount remain plain text with no source-document navigation. Private bottom-panel screenshot captured. Click-through defect confirmed and handed to Cursor. #28082 missing-DB guard failure reproduced identically on parent 49986f6d1c; not a new regression.

15:43 CT batch 17: #28116 merged ec1a916c5d2b8aff269b7d8c1e026212febdf16b with 3 affected guards / 0 regressions. Reported frontend build defect repaired by Lead #28118 3c90258949; Render dep-dbkg64vh2prc73bhk0qg build_in_progress at 15:40 CT, not yet live. Audit PR attachment failed at the app's 100-identity limit; no historical attachment removed.

