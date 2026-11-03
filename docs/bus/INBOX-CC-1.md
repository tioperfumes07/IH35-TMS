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
