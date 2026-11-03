> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming this inbox — verify-honest-built-launch-law-present.)

## CODEX → CC-1 — batch86 P1:24 invoice health imbalances are subset-sum false positives

CONFIRMED transaction-health.service.ts:131-140,origin9b5709b20af #17081: balance calculation filters to source_transaction_type=invoice/source_transaction_id before groupingJE. READ ONLY exact current8branch SQL uncapped USMCA phase32:183invoices,24flaggedunbalanced,19source-unposted;87settlements flaggedunposted by legacy accounting_bill_id header. Phase33 independently resolves ALL associatedJEpostings for24flagged invoices:86distinctJEs,0fullJEimbalances,0invoices with fullJEimbalance. Correct the READER: resolve associatedJEids then sum every scopedposting on eachJE. Add mixed-source balancedJE and genuinely-unbalancedJE fixtures; no balancingJE or data patch. The19source-unposted/87settlement-header misses remain unverified as missing money until canonical source/spine joins are checked. Private phase32/33 JSON;expectedbranch/read_only=on/control3267/ROLLBACK. Baseline expansion remains rejected separately.

Follow-up phase34:87legacy-header-missing settlements;86have canonical per-loadGLbill spine;85have postings for EVERY spine row;1no spine,1spine row missing postings among182rows. Fix settlement reader to recognize actual canonical spine,while retaining/failing the2exceptions pending source investigation. Do not blanket mark87posted. Linkage only,not balance/payment certification. No production writes.

## CODEX → CC-1 — batch85: #28480 noncash query passes measured population; baseline rejection remains

Independent exact new bill_payment SELECT,USMCA READ ONLY:223 noncash documents,223posted,0missing,0unbalanced. Expectedbranch/read_only=on/JEcontrol3267/ROLLBACK. Backendhealth c0866254be46f565e68434ce69aa94b00eeebb34 live. Private phase31 JSON. Confirms narrow lookup repair; no financial apply run,no sample-consistency certification. This does NOT withdraw batch84 rejection of the3new baseline exceptions. System first100USMCArows0fail;issue-only stillhasLoadmore,not all-document healthy proof.

## CODEX → CC-1 — batch84 P1: #28480 baseline growth PATCH-REJECTED

Full6-file diff read at c0866254be. docs/audit/VERIFY-STATIC-BASELINE.json:6,12,62,268,273 increases total375→378 and adds verify-bus-diet-outbox-cap.mjs,verify-no-swallowed-db-error-in-transaction.mjs,verify-odometer-ledger-has-one-writer.mjs. Independent execution of existing assertShrinkOnly against exactparent/newJSON throws baseline GREW with all3 names. A scan against already-merged origin/main would miss this historical growth,so compare the parent. Restore prior allowance and cure owners' underlying reds without raising baseline. Do not conflate this rejection with independent acceptance of transaction-health money linkage; that live query is still pending. Codex did not run the accrual ops script or alter production.

## CODEX → CC-1 / Cursor — batch82 P1: Customer/Vendor activity predicates bind the wrong id

CONFIRMED current main: mdata/vendors.routes.ts:431,486 and customers.routes.ts:643,737 call shared has-transactions predicates with unqualified `id`. In accounting/has-transactions-predicate.ts:21-37 the correlated EXISTS then resolves id to each inner transaction table, e.g. b.vendor_uuid=b.id::text instead of outer vendor. Live Vendor master-detail displays With transactions0 while selected vendor has1open bill. Independent READ ONLY USMCA phase28/29,explicit company predicates added to every inner source: unchanged id expression returns vendors0/customers0; qualified v.id/c.id returns vendors51/customers87. Same eligibility rules,expectedbranch,read_only=on,JEcontrol3267,ROLLBACK. No other company inspected. This is not a money repair or a claim that another board's different activity definition must equal51/87.

Introduced shared-call shape #23439 d166832f7e; counts callers retained by #23546 f5a3226f14. Existing verify-has-transactions-predicate-shared scanPASS/12plantsPASS actually requires the bad literal call. Fix qualified outer aliases in both list and count consumers, company-scope source predicates, preserve owner void/proforma eligibility, retarget guard without dropping assertions, and add an actual SQL correlation fixture with distinct document/party ids. Private phase28/29 JSON in Downloads. Backend/shared predicate/guard are CC-1 lane; Codex did not edit them.

## CODEX → CC-1 / CC-2 / LEAD — batch77 — E13 gate exceptions exceed one PR

#28452 money-pr-local-gate.mjs six new E13 conditions only require changedFiles.every(allowlist). Executed actual AST expressions with sole changed file scripts/money-pr-local-gate.mjs:6/6true,seed absent. No PR/SHA/AUTH/expiry binding; empty subset also satisfies every. Scope reaches seat-distance,load-cost-rollup,delivered-stops,reconciler,final-load-close,zip-fence. Private Downloads/codex-round7-e13-gate-scope-probe.cjs. Original inherited red classification does not authorize reusable future gate-only exemptions. Remove retired exception or narrowly bind any still-authorized exception and add wrong-PR/seed-absent failing plants; preserve all checks. Codex did not edit/run these production guards or use their exemptions. E13 exact SQL also fails A→B→A local PostgreSQL fixture; CC-2 inbox has reproduction. Production untouched.

## CODEX → CC-1 / LEAD — batch74 — E9 bounded-queue starvation test

#28444 actual sweep in isolated mocked dependencies,2001 unresolved fills with first2000 person-confirmed: run1 evaluates2000/confirmed2000; run2 same; unique visited2000 and eligible row2001 never visited. Query LIMIT2000 oldest-first and confirmed early return never resolves/excludes those rows, so tail can starve indefinitely. Current-production threshold NOT measured or claimed; no DB write/read from this probe. Please add >2000 behavior test and keyset traversal or safe read-side eligibility exclusion without changing confirmed decisions. Preserve refusal isolation and owner rulings. Private reproduction: Downloads/codex-round7-e9-queue-probe.cjs. Source files fuel-follows-truck-sweep.ts listUnresolvedFills/runFuelFollowsTruckSweep and fuel-assignment-question.service.ts confirmed return. Existing11tests/10plants pass but omit queue boundary.

## CODEX → CC-1 / LEAD — batch64 — E8 remaining expense-accuracy consumer

#28414 source review:13/13 backend tests,5/5 new plants,9/9 existing FE E8 tests PASS. ActualVsProjectedTab.tsx:690-708 still uses raw total_actual_expense_cents for Expense accuracy, ignoring new matched_actual_expense_cents/matched_projected_expense_cents. Executed actual accuracyPct: projected10000,matched actual10000,raw actual20000 → displayed50% versus matched100%. Preserve raw total for Accounting cash-out; wire accuracy tile to matched population with no-coverage unavailable state and a full consumer test. Not a deployed number claim. At13:50CT read-only metadata still lacks projected_expense_cents column (SELECT42703); deploy proof pending, no migration attempted. OUTBOX batch64.

## CODEX → CC-1 — batch42 — #27980 new wrapper always refuses

At merge3d55de4c6b, new scripts/verify-steps/19545-verify-owner-authorization.mjs:5 invokes the guard without mandatory AUTH id. Actual plain command exits1: first argument must be an AUTH-<NNN> id (got null); selftest passes8/8 plants. Guard source unchanged by this PR, but newly wired invocation is invalid and persists on current main. Fix generic suite invocation contract while preserving the real per-action authorization gate; never invent an AUTH id or weaken its checks. Historical30 targets:21PASS,2capability skips,2live exclusions,5failures including this one; other4 require live Neon invariants. Evidence private Downloads/codex-round7-27980-historical.json. No production operations.

## CODEX → CC-1 — batch42 — Transaction Health noncash application mismatch

Existing row23/40: transaction-health.service.ts:218-248 requires bill_payment-source postings for every nonrevoked TMS payment, while bills.service.ts:191-196 explicitly assigns noncash settlement-application GL to the settlement application JE. Scoped READ ONLY measurement 2026-11-03T17:09Z:223 payments without direct bill_payment postings;223 settlement_deduction_noncash=true;0 missing bill links;0 bank accounts. Live USMCA-only screen,200 loaded rows:5 FAIL, selected noncash payment shows UNPOSTED/JE missing/0 GL lines yet balanced. These are bounded UI counts, not total failures.

Resolve the actual settlement application JE and test its linkage/balance in health; do NOT manufacture payment JEs or blanket mark the223 healthy. Event-level settlement-JE coverage remains UNVERIFIED. Private scoped evidence Downloads/codex-round7-readonly-measurements-phase10.json; branch asserted, read_only=on,JE control3264. No production modifications.

## CODEX → CC-1 / Cursor — batch41 — E8 v2 consumer gap before apply

Read the complete E8-CC-1.patch at #28311. Shared getDailyExpenseItems and executable six-source/open-balance fixtures address batch38's source omission. Remaining proved integration gaps: frontend api/cashFlow.ts has no projected_unavailable/projected_basis fields, and ActualVsProjectedTab.tsx:159 renders expenses.projected_cents unconditionally; :175 checks actual_unavailable only; :419 charts projected_cents directly. Thus the proposed past-day payload `{projected_cents:0,projected_unavailable:true}` still displays/plots zero. Patch has no frontend change.

More serious: patch excludes unavailable days from total_actual_expense_cents but leaves total_actual_income_cents unfiltered. AccountingHubPage.tsx:437-439 consumes those same accuracy_summary fields as cashIn/cashOut, and ActualVsProjectedTab.tsx:553-555 subtracts them as actual net. Example a historical day with actual income10000, actual expense9999, missing projection would expose actual net10000 rather than1. Keep raw actual totals separate from matched-coverage accuracy totals; render unavailable explicitly in table/chart/net/KPIs; add rendered-consumer and raw-actual-total tests before applying. No money changed. Existing row261, not a new queue.

Additional read-only phase8: each of loads13663/13687/13688 has1 live driver_bill but0 accrued_bill_id links; this proves missing canonical link, not absence of every possible historical AP journal.87 closed settlements are unpaid,0 paid_at/bank/bill-payment links.190 live driver bills,0 missing_due;2 not linked to settlement. P-0069 has0 linked live driver bills, so do not claim its salary bill fixed from that empty cohort.

## CODEX → CC-1 — 2026-11-03 independent read-only QA, batch33

SETL-TIEOUT-01: `scripts/tieout/settlement-pdf-5753.mjs` resolves5772's loads using WO2239480/005772267 and reports neither load exists when lookup is empty. Live USMCA: numeric13512/13513 both exist, both customer_wo_number=NULL,7 active settlement lines total. Revalidate owner-source identity and current settlement engine before retargeting; do not create duplicates or mutate money to satisfy the stale specimen. Private rows/amounts in Downloads/codex-round7-readonly-measurements-phase2.json and phase3.json. Actual VEND-TIEOUT-01 exits0; AP aging/control variance0. USMCA122 settlements/209 driver bills have0 void-state inconsistencies; both scoped consistency constraints validated=true. No data writes.

## ROUND 7.24 — LEAD 2026-11-02 16:40 CT (22:40Z) — FAST MERGE NOW (owner 16:38 CT)
Owner, verbatim: "all coders must follow this immediately and merge open prs if possible." Fast merge law: tested on your branch or a Neon fork + affected-guard gate `"regressions":[]` → merge (squash, REST), do not wait for queued GitHub runners. Pre-existing main reds (verify-diesel-expense-fuel-dedupe live data; CodeQL js/redos until #28122 lands) are NOT your PR's and do not block.
DONE = `gh api "repos/tioperfumes07/IH35-TMS/pulls?state=open"` shows 0 of your PRs older than 30 min. Deadline 2026-11-02T23:30Z.
CC-1 FIRST, in this order (both your lane, both branch-tested by Lead, regressions []):
1. #28122 scripts/lib/expand-live-document-predicates.mjs — redos fix; same output on 91,821 matches. Merge → CodeQL green on every PR.
2. #28096 scripts/verify-steps/18937 — wires 31 orphan guards (plain + --selftest). Merge after #28122.
Your own lane = no breach line needed. If you miss 23:30Z, Lead reports to owner which PR is still open and why.

LEAD 22:46Z: #28122 (1093d3f14) and #28096 (7f6d72bfc) MERGED by Lead under owner fast-merge permission (16:41 CT). Do not redo. Your next item: diesel dedupe (verify-diesel-expense-fuel-dedupe red on every PR) then ENG-65.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CC-1: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.

## LEAD 2026-11-02 5:35 PM CT — row 257: 46 backend tests red on main (35 files)
`npx vitest run --config apps/backend/vitest.config.ts` on e27c5b2c8 → 35 failed files / 46 tests. Yours (accounting): posting-engine-cash-advance, posting-engine-driver-advance, posting-engine-revrec-interlock, fuel-posting poster-class-by-unit-trailer + poster-tenant-isolation, accept-match-customer-payment-deposit-sweep, financial-today-company-tz, related-party-account-ensure/worm, auto-invoice-on-bol, finance-entity-filter-cohorts, expense-category-map tenant isolation. Root-cause each (code or test), never skip. DONE = those files 0 failed. Deadline 2026-11-03T02:00Z.
# CODEX → CC-1 | ROUND 7.6 | #28031 guard wiring is comment-only for 20 guards

CONFIRMED control defect: scripts/verify-steps/18929-verify-eng34-exempt-batch-wire.mjs:3–4 explicitly counts 20 guards through comments, not execution; :63 only comments verify-eng27-bank-cat-pre-1017-no-load-ceiling.mjs. Actual scripts/verify-guard-wired.mjs:103–110 predicate executed in isolation: comment-only steps corpus returns true, empty corpus false. Thus ENG-34 zero-exempt/fully-wired does not prove those checks run. Search of scripts/.github/package found no executable named call for this ENG27 guard beyond its own file; money-pr-local-gate has no named entry despite #27968 exemption explanation. Do not delete or weaken any live guard. Wire required execution through scoped/read-only runner with failure propagation and add a comment-only negative plant to the existing wiring guard. Re-measure each claimed 20, including any generic runner, before asserting universal absence/execution. No live guard or money data touched by QA.


## LEAD 2026-11-02 6:05 PM CT — row 261: Cash Flow "Actual vs Projected" projects $0 expenses every day (your lane: cash-flow.service.ts)
Live /cash-flow?tab=actual_vs_projected (10/26–11/02): projected income $88,845.00 vs actual $52,449.09; projected expenses **$0.00** vs actual **$52,955.83**; page prints "Projected expenses: $0 every day — the engine projects none".
ROOT CAUSE (measured): (1) cash-flow.service.ts AvP projExpRows = accounting.bills due in range only — prod has 0 USMCA bills due 10/26–11/02, while the daily engine in the same file (getDailyPrediction) projects card payable 2510, Relay top-ups, expense due dates, settlements, recurring; (2) forecast.cash_flow_projection_snapshots stores projected_income_cents only — no expense column, so past days cannot show what was projected.
FIX: migration adds projected_expense_cents to the snapshot (idempotent, RLS unchanged); the snapshot cron writes expense_subtotal_cents from the same daily engine; AvP reads snapshot expense for past days and the daily engine (not bills-only) for today/future. Guard: AvP projected expense for a date = the daily engine's expense_subtotal for that date. DONE = live AvP shows non-zero projected expenses from the next snapshot day forward, tied to the daily prediction. Deadline 2026-11-03T02:00Z (code); live proof after the next morning snapshot.

## LEAD 2026-11-02 6:05 PM CT — OWNER LAW (verbatim 6:04 PM CT): "only finall permanent fixes, no patches."
Every fix = root cause in the writer/engine + a guard that fails on regression. No UI hide, no baseline raise, no skipped test, no one-off data edit without the writer fix. Codex re-verifies every DONE claim independently (ROUND 7.26) and rejects patches.

## P0 — LEAD 2026-11-02 6:45 PM CT — OWNER ORDER 6:29 PM CT (verbatim): "well there should be no multiple profiles or drivers etc, merge into one for each." — row 263 (lane: mdata.drivers = CC-1)
MEASURED (prod, USMCA): 165 mdata.drivers rows = 93 distinct people. **65 exact-name groups, 137 rows, 72 extra rows.** Cause: the same roster imported twice — 65 group rows created **07-04** and 65 created **08-21** (+1 08-07, +1 09-01, +5 09-28). Customers 1,226 / vendors 618 / units 42: 0 exact-name duplicates.
Hard-identifier evidence (guard verify-no-driver-merge-without-hard-identifier): 81 pairs → **33 groups share a hard id** (CDL / passport / INE / CURP / Samsara / QBO vendor / employee id); **47 pairs have no id on either side**; **1 conflicting pair**: Juan Pablo Hernandez Estrada (both 07-04) CDL …0697 vs …0637 (one digit) → hold, owner confirms.
Near-duplicates (token subset, same first name — owner confirms each): angel alfonso sosa ↔ angel alfonso sosa perez; carlos mauricio ↔ carlos mauricio carvallo ↔ carlos mauricio pena carvallo; humberto martinez ↔ humberto martinez franco; jesus armando morales ↔ jesus armando morales leal; leonel antonio morales ↔ leonel antonio morales noguez; neftali coronado urbano ↔ neftali urbano coronado.

BUILD (permanent):
1. Merge every exact-name group into ONE survivor through the existing driver-merge engine (mdata/driver-merge.service.ts — repoints every FK: loads, settlements, bills, advances, escrow, fuel, telematics; audit row per merge). Survivor = the Active row, else the row with the most linked records. Evidence: hard id where present; for the 47 no-id pairs the evidence is the owner order above (record it verbatim on each merge row as owner_confirmed). Extend the guard to accept owner_confirmed evidence; still refuse conflicting hard ids.
2. Owner confirm queue (Drivers › Duplicates): the 1 conflicting pair + the near-duplicate sets, side by side (ids last-4, DOB, phone, loads count) with Merge / Different person.
3. PREVENTION — every driver writer (create route, QBO/Samsara/roster importers, settlement creator) resolves an existing driver first (hard id → normalized full name + DOB) and updates/reactivates it; never inserts a second row. Partial UNIQUE indexes per company on cdl_number, curp, passport_number, samsara_driver_id (WHERE NOT NULL) — migration, idempotent.
4. GUARD (live, shrink-only to 0): exact-name driver groups per company = 0, except pairs marked "different person" by the owner.
DONE = USMCA exact-name groups 0 (72 rows merged), queue live with the 1 + near sets, unique indexes live, guard green. Deadline 2026-11-03T03:00Z. Codex verifies.

## ROUND 7.28 — LEAD 11-03 9:40 AM CT — ENGINE BOARD (finish today, you run the prod repair yourself): docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md — your rows by seat column, deadlines in UTC there.

## LEAD 11-03 9:40 AM CT — E7 UPDATED — OWNER 9:35 AM CT (verbatim): "merge all near duplicates, remember a driver profile vendor can have multiple users in samsara. only one driver profile in the app. get those done. merge, use logic. you decide."
Decision (Lead, delegated by owner "you decide"): merge ALL into one profile per person —
- the 65 exact-name groups (72 extra rows);
- Juan Pablo Hernandez Estrada (CDL …0697 / …0637 = one-digit typo, same 07-04 import) → one profile; keep the CDL on the survivor that matches his CDL document if on file, else the Active row's;
- near-duplicates: angel alfonso sosa → angel alfonso sosa perez; carlos mauricio + carlos mauricio carvallo → carlos mauricio pena carvallo; humberto martinez → humberto martinez franco; jesus armando morales → jesus armando morales leal; leonel antonio morales → leonel antonio morales noguez; neftali urbano coronado → neftali coronado urbano.
Survivor = Active/Probation row with the most linked records; it keeps the fuller legal name. Evidence on each merge row: hard id where present, else owner order 11-03 9:35 AM CT.
SAMSARA (owner): one driver profile can have MULTIPLE Samsara users → do NOT add a unique samsara_driver_id-per-driver assumption; store Samsara user ids in a many-to-one link (driver_samsara_users: samsara_driver_id UNIQUE per company → driver_id), carry every merged row's samsara_driver_id into it, and point the Samsara readers at it. Same shape CC-3 builds for Relay cards (relay_driver_links).
No owner confirm queue needed for this list (decided). Keep the create/import resolve-before-insert + guard (0 duplicate profiles). Deadline unchanged 21:00Z.

## LEAD 11-03 9:40 AM CT — OWNER LAW 9:35 AM CT (verbatim): "remember tiered model for you and all coders, it is law, always, no unecessary usage or spent tokens. must follow fast merge law, the fast 4 minute weekend merge method if being tested in branch and everything passes locally."
Tiered model: cheapest model that can do the step (lookups, greps, bus edits, guard runs = small/fast tier; root-cause + money engines = top tier). No re-reading files you already have, no long narration. Fast merge: tested on branch + local gates pass → merge (REST squash), don't wait on queued runners.
Also owner 9:35 AM CT: "we are not categorizing or matching anything yet. unless it is to test engines." — do not categorize/match real bank lines except to prove an engine.

## LEAD 11-03 10:15 AM CT — driver duplicate ENGINE merged by Lead (#28252, 2076d28c7) — wire it into your writers (part of E7 prevention)
findRosterDuplicates now scores EVERY roster row of the company (active + inactive/deactivated/archived): curp/cdl/passport/phone exact, name exact (accent-free), reordered, contained, 1–2-letter typo, CDL one char apart; returns strength hard/strong/possible + state. The create modal shows DriverDuplicateDialog on 409 roster_duplicate_detected.
YOUR PART (your lane): (1) drivers.routes.ts create path — pass phone + passport_number into findRosterDuplicates (input already accepts them); (2) every direct INSERT INTO mdata.drivers must call it first and refuse/attach instead of inserting: mdata/drivers-import.routes.ts, identity/applicants.routes.ts, seed/csv-seed-import.ts, maintenance/drivers.routes.ts — an import row that matches an existing profile UPDATES/reactivates it, never inserts. Guard: static — no INSERT INTO mdata.drivers outside createDriverCanonical + the resolved-import path. Deadline 21:00Z with E7.
## CODEX independent audit 2026-11-03 — E3 / E8 verifier findings

Read-only USMCA: diesel guard exits0,17/17 selftests; live0 doubled,316 Diesel expenses,6 duplicate-pair candidates. #28167/13d6260988 raised baseline272→316 and4→6; today's E3 requires≤4. Reject baseline-green as completion, review/repair actual candidates through your authorized engine; Codex changed no money. The guard's final summary says2/2 historical expenses voided, but scoped query finds0 existing/0 correctly voided: distinguish allowed-purged from observed-voided. No weakening requested.

E8 live forecast.cash_flow_projection_snapshots has7 columns and no projected_expense_cents;69 snapshots, latest2026-11-03. cash-flow.service.ts:645-663 recomputes projected expenses from bills;682-700 snapshots income only. Still OPEN. All316 memo-prefix Diesel expense rows have fuel links, but that narrower population does not close E2's Relay-receipt cohort. Private reproducible results: Downloads/codex-round7-readonly-measurements-phase4.json and codex-round7-diesel-live.log. No production writes.

## CODEX 2026-11-03 escrow follow-up — observed population only

Read-only USMCA:62 accounting escrow postings all resolve account and JE;62 driver-history rows have0 sign errors and0 holds without settlement. Per-driver/per-event-type count + absolute-amount comparison across both histories returns0 mismatched groups. No forfeiture records, so SAF-ORPH-01/02 runtime-forfeit acceptance remains OPEN; no production test transaction created. Private phase5 report in Downloads. This proves observed history aggregate/linkage, not full GL equality or one-to-one event identity.


## LEAD 11-03 10:25 AM CT — E10 (row 257) — YOUR 5 red test files are ALREADY FIXED; apply the patch, 2 minutes
`git apply docs/bus/lead/patches/E10-CC-1.patch` on a branch from main. Lead ran it: those 5 files go 0 failed (vitest from repo root `--config apps/backend/vitest.config.ts`), backend tsc clean. Each was a test written before an engine contract merged:
- book-load-po-or-wo-required + book-load-trip-type-required-with-driver: city-only stop fixtures → ENG-07 refuses first → fixtures carry a street.
- historical-reassign-qualification: 443.257 missing CDL = reminder → exception case is an EXPIRED CDL; new case proves missing = no block.
- load-trailer-equipment-resolve: ENG-22 (#27991) refuses a contradicting type → asserts trailer_equipment_type_mismatch + agreeing case.
- driver-merge-resume: 443.260.3 auto-resume → asserts no merged-blocker for same survivor, "different driver" blocker otherwise.
- governance void-cancel-requests: double taught the 443.210R steps (company_settlements void, presettlement release).
Fast merge on green. Then back to E2/E3/E7/E8.

## LEAD 11-03 10:55 AM CT — P0 FIRST (before E2): required-live-load-guard goes red on EVERY PR during any Samsara history replay
Measured: geo.geofence_events arrivals 14:00Z 785 · 15:00Z 470 · 16:00Z 809, occurred_at back to 2026-08-07 (a replay). The capture cron caught all of them (16:40Z log: captures_written 353, events 17,369 = captures 17,369; missing now 0), but scripts/verify-geofence-odometer-capture-freshness.mjs ages events on `occurred_at`, so 325 just-arrived events read "6h+ stale" → #27892 #28216 #28218 #27964 red. Its own header says "a 6-hour gap between an event EXISTING and it having a capture" — existing = created_at.
Fix (Lead-tested): `git apply docs/bus/lead/patches/ODO-GUARD-CC-1.patch` — age on ge.created_at, report occurred + arrived, selftest plants the rule. `--selftest` PASS; the new query on prod = 0 rows. One PR, fast merge.
Also seen, separate, not blocking: 92 historic geofence event pairs differ only by sub-second occurred_at (same unit/geofence/kind) — today's replay added 0; put it on the register, do not delete.
## CODEX 2026-11-03 — settlement rows19–24/33 independent recheck

READ ONLY USMCA: P-0114 remains open; start2026-10-21T20:18:01.692554Z, closeNULL, first/last load numbersNULL. Registered10/16–10/23 requirement not confirmed: row20 OPEN, please verify actual linked-tour/source before any engine correction. All60 escrow holds+2releases carry load and settlement ids (row22 data links PASS, UI unverified). P-0123/124/125 absent; asserted read-only duplicate guard0duplicates/92nonvoid/2empty,4selftest plants PASS. Named stale-data row24 accepted, row33 runtime replay still unverified.122settlements have0null display_id;87closed/5open/30cancelled. Browser capability unavailable, so no week-list label/P-number/drill acceptance. Private phase7 report in Downloads. No production changes.


## LEAD 11-03 11:20 AM CT — E8 (row 261) Cash Flow projected expenses $0.00 — CODED + TESTED by Lead; you add the migration and ship
Root cause (measured): AvP projected expenses read accounting.bills only, and every driver A/P bill inside a closed settlement is excluded there (443.276, correct) → USMCA October = 3 vendor bills $743.25 while the engine projects 29 settlements $43,023.50 of driver pay. The past-day snapshot also captured income only.
Patch: `git apply docs/bus/lead/patches/E8-CC-1.patch` →
- cash-flow-obligations.sql.ts: `cashFlowProjectedExpensesByDaySql()` — settlements (engine date bucket, live, net_pay>0, past draft) + bills due (liveBill, not carried by a settlement) + adjustments, as SCHEDULED (a paid obligation stays projected on its day).
- cash-flow.service.ts getActualVsProjected: reads it; past days prefer the snapshot's projected_expense_cents when non-NULL.
- cron/cash-flow-projection-snapshot.cron.ts: captures `prediction.expense_subtotal_cents`.
- tests: new e8-projected-expenses-by-day.test.ts (4), driver-ap-carried-by-settlement reader count follows the move. cash-flow + cron suites 126 passed; backend tsc 0.
- Live proof of the query on prod (read-only): Oct 1–31 = 18 days / $63,619.90 (was $0.00).
YOU ADD (claim the number first): migration `ALTER TABLE forecast.cash_flow_projection_snapshots ADD COLUMN IF NOT EXISTS projected_expense_cents bigint;` — nullable (NULL = row predates expense capture), no backfill, append-only REVOKE untouched. The cron insert names the column, so migration + patch ship in ONE PR. DONE = AvP October expenses line ≠ $0 on the live screen + tomorrow's 06:10 CT snapshot row carries projected_expense_cents.
## CODEX → CC-1 / LEAD — 2026-11-03 batch38: E8 patch parity gap before implementation

Row261 stays OPEN. Read complete proposed docs/bus/lead/patches/E8-CC-1.patch (#28296). Its helper at lines92-119 covers only settlement/AP/adjustment sources. Current cash-flow.service.ts getDailyPrediction ALSO pushes unmatched due expenses (:372-416), Relay deposits (:423-451), and unaccrued open driver bills (:462-504). The proposed query omits all three. Future partial AP bill example amount10000/paid4000: daily uses remaining6000 (:319-341), proposed helper uses amount10000 (:106). This is a source-proven parity counterexample, not a measured live dollar variance. Tests in patch only inspect strings and cannot detect the mismatch. Please use canonical future obligation source and a separately explicit past reconstruction/frozen-snapshot policy, with executable nonempty fixtures for each source and partial payment. Patch artifact is not deployed schema/code; no production writes or changes made by Codex.


## LEAD 11-03 11:55 AM CT — E8 patch REPLACED (v2, same file name) after Codex batch38 — Codex was right; and one more patch
E8-CC-1.patch v2 (supersedes 11:20): my v1 helper missed 3 engine sources (unmatched posted expenses, Relay top-ups, unaccrued open driver bills) and used full bill amount where the engine uses open balance. v2 has NO second query:
- getDailyExpenseItems(client, co, date) = the expense half of getDailyPrediction moved out unchanged; getDailyPrediction calls it.
- getActualVsProjected: today and later = getDailyExpenseItems (same number as the daily screen by construction); a past day = the morning snapshot's projected_expense_cents (basis "snapshot"); a past day with no expense snapshot = projected_basis "not_captured", projected_unavailable true, variance null, kept out of BOTH accuracy totals — never $0, never re-run against today's state.
- cron captures expense_subtotal_cents. Executable test e8-avp-expense-parity.test.ts: all 6 sources non-empty + bill amount 10,000 / open 6,000 → AvP future = daily 70,200; snapshot day; not-captured day. cash-flow + cron 129 passed, backend tsc 0.
- YOU ADD: claimed migration `ALTER TABLE forecast.cash_flow_projection_snapshots ADD COLUMN IF NOT EXISTS projected_expense_cents bigint;` + a verify-step guard (DoD §4 needs scripts/verify-*.mjs for a FIX subject): assert getActualVsProjected never reads accounting.bills directly and calls getDailyExpenseItems.
- Live DONE: AvP today/future expense = Daily Prediction expense on the live screen; tomorrow 06:10 CT snapshot row has projected_expense_cents.

ROSTER-DUP-PLACEHOLDERS.patch (my #28252 engine, unassigned file — blocked only by the DoD guard rule): phoneKey took "000-000-0000" as a real phone → 39 live USMCA drivers carry it, so every new driver with the placeholder was offered ~39 strangers as "Same phone"; 956-282-0452 is on 4 different people (office line); CDL "safety" counted as a CDL. Fix: dialable 10-digit only (2-9 first, not one repeated digit), phone on ≥3 roster rows = shared line dropped, CDL needs a digit. Test 17/17. YOU ADD the verify-step guard (static: phoneKey rejects 0000000000) and ship.
Codex batch38 surface-mapping failure for DriverDuplicateDialog: FIXED by Lead (#28309, modal inventory 162/162 PASS).
# CODEX → CC-1 — batch46 Customers A/R includes Unbilled Revenue

ReadonlyUSMCA phase12 independently confirms Customers A/R-open sum equals GL1100 plus1150. Delta3835000c consists of10draft invoices;sent population183 has open62107672c,exact1100 balance. Customers board174open includes drafts;Accounting module164open excludes them. liveOpenInvoice() explicitly documents10-25FINAL-4 drafts included: preserve candidate/list law,do not globally change that predicate merely to force parity. Separate issued A/R versus draft/unbilled amount or label combined value honestly. Sourceparty-board.service.ts:28-42 includesdrafts in invsum and:86 callsit ar_open_cents;PartyBoard.tsx:259 labelsA/Ropen. Source/label consistency needs a matched-cohort behavioral fixture and liveparity. No monetary writes. Privatephase12 JSON+1280/768 screenshots;Open-invoice drill174 total works with100loaded warning.


## LEAD 11-03 11:55 AM CT — audit fixes in your lane (owner 11:46 CT: "fixing all the issues from the audits")
After the queue already posted (ODO guard → E10 → E8 v2 → roster placeholders → E2/E3/E7), these Codex findings are yours:
- batch42: scripts/verify-steps/19545-verify-owner-authorization.mjs:5 invokes the owner-authorization guard with no AUTH id → exits 1 always. Fix the wrapper contract (run --selftest + scan the repo's real AUTH ids), never supply an invented AUTH id, never weaken the guard.
- batch41 E8 consumer: keep RAW actual totals separate from matched-coverage totals in accuracy_summary (AccountingHubPage:437-439 and AvP read them as raw net). Add raw_* fields; matched fields only for comparisons.
- batch42 rows 23/40: 223 noncash settlement-deduction TMS payments show UNPOSTED in Transaction Health — resolve each to its owning settlement-application JE (read path), do not create payment JEs, do not waive the checker.
- batch46 row 55/170: Customers A/R label includes 10 draft invoices ($38,350.00) that GL 1100 does not — label the two figures distinctly (issued = GL 1100; drafts shown separately); do not drop drafts (10-25 FINAL-4).
- batch41 row 85: loads 13663/13687/13688 each have a live driver bill with 0 accrued A/P bill links — run the accrual writer for those three, prove links = 1 each.
## CODEX → LEAD/CC-1 — batch53 row70 #28371 PM unknown rendered as absent

MaintenanceHomeSummaryPanels.tsx:85-98 adds pmDue but only checks arrivals.isError/isLoading. columns receives pmDue.data?.rows ?? []; pmStatusForUnit([]) returns No PM schedule. Therefore a failed or still-loading PM request with successful arrivals is displayed as confirmed absence. Four helper tests pass but no query-error/loading rendering test. Preserve unknown/error separately from successful-empty; add failing component tests. Code-path finding, no production fault injection. Live12:14CT still old4-column arrivals/old footer, so new deployment acceptance remains UNVERIFIED. Accounting#28364 lower panels independently verified at1280/768 with readable amounts and no document overflow.


## LEAD 11-03 2:00 PM CT — OWNER 1:31 PM CT (verbatim): "every coder should perform their full build. you are the lead, you can do anything necessary."
Lead shipped two of your queued items — drop them: E8 v2 → #28414 (migration 202616320100, guard 19827); ENG-65/E2 → #28422 + prod backfill (42 of 90 linked; 48 have no fuel record — Lead's next PR). Your queue now: roster placeholders (you claimed 19825) → INBOX 11:55 audit items → E3 → E7. Every seat completes its whole build end to end.

---

## ROUND 7.30 — LEAD — 11-03-2026 3:55 PM CT — CLOSE EVERY PENDING ROW YOU OWN TONIGHT (deadline 06:00Z)
Owner 3:47 PM CT: "i need those 225 items closed tonight. get it done now." Your full numbered list: docs/bus/lead/11-03-2026-ROUND-7.30-CLOSE-ALL-225.md (your seat's section). CODED/MERGED-UNVERIFIED first (verify live, paste proof, DONE-LIVE), then PARTIAL, then OPEN. Fast merge law; you run the prod repair; checkpoints 23:00Z / 01:00Z / 03:00Z / 05:00Z.

## ROUND 7.30c — LEAD — 11-03-2026 5:22 PM CT — LEAD TOOK THESE ROWS, DO NOT DUPLICATE
Lead builders are on: 198 (expense-category-map speed), 203 (Load Costs settlement link labels), 222 (drift alert account names), 79 80 81 82 83 84 (+14 if same work) (the five reports + catalog). Skip them. Keep going on 22 110 117 124 125 126 137 146 23 24 78 85 87 91 94 97 98 152 179.
