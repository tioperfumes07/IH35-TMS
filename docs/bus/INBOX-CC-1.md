ADDED 12:40 PM CT: ENG-48 WRITER is yours (7.3-E) with the bridge (mass apply deferred — build + dry run) · main red: verify-no-swallow-on-money-paths settlements-load-bookended.service.ts:1201 (7.3-F) · dedupe guard 316>272 / 6>4.

YOU ARE IDLE — START NOW. ENG-34 53→0 · ENG-25b dry-run engine + guard 18925 (AUTH-464 does not exist) · ENG-04 AUTH-gated apply path ($705.97) · ENG-48 bridge review (147 fills / $24,678.73, dry run) · modules BANK-TIEOUT-01, ACCT-TIEOUT-01, VEND-TIEOUT-01.

**Deadline 2026-11-03T02:00:00Z (8:00 PM CT). Missed → Claude Lead takes the surface.** Fast 4-minute merge: branch prefix = your seat (never `chore/`), claimed_by = your seat, checkNoRegressions 0 → `SEAT=<you> node scripts/fast-merge.mjs`. Full verticals only — no shells. Prod --apply only under an OPEN AUTH. Never stash · never fake-green · USMCA only.

Superseded: every earlier CURRENT block.

## PRIOR (11-02-2026 11:55 AM CT) — Claude Lead — ROUND 6 (superseded by ROUND 7)

## PRIOR (10-26-2026 01:55 AM CT) — Cursor Lead — your static reds
Exact: `docs/bus/lead/10-26-2026-Cursor-LEAD-SEAT-LISTS.md` (CC-1 section). Re-run each guard before coding.
Still owed: bills-settlement-column-linkage · cash-advances-f9930-no-silent-catch · cash-advances-home-staged-filters · cash-advances-table-parity-surface-bar · cash-flow-independent-of-proforma-timing · creator-advance-is-bill-payment-on-its-load · deadhead-pay-line-renders-on-settlement · escrow-ledger-row-has-load · list-empty-settled · verify-settlement-creator-atomic-post --selftest (pre-existing tip red).
Cleared on tip — do not redo: cash-advance-requests-parity-surface-bar · escrow-pending · item-income-account-required · load-miles-match-settlement-document · settled-load-stops-carry-the-document · truck-one-in-motion-plus-advance.
Merge via `node scripts/fast-merge.mjs`. Never stash. Never fake-green. USMCA only.

## PRIOR (2026-10-25 01:45 PM CT) — LEAD. FINAL-2 — WORK TO THE LAST ROW, NO PAUSES.

**Your whole job:** [lead/CC1-FINAL-2.md](lead/CC1-FINAL-2.md) + the 20 rows in [lead/CC1-PENDING-ROWS-FINAL-2.md](lead/CC1-PENDING-ROWS-FINAL-2.md).

1. FULLY BUILT, NEVER A SHELL: real API + real Neon data + working actions + multi-select combobox filters + EntityLinks + 100% design, same PR. No docs-only "row closed" PRs.
2. Fast 4-min merge: gate once, frontend+backend tsc, push once, squash-merge. Never --no-verify.
3. Coding only, no Chrome. Answer from repo/docs/LAW/register/journal; ASSUMED: in PR body.
4. Report "CC1 DONE" + PR list in OUTBOX-CC1.md.

Superseded: every earlier CURRENT block.

## LEAD 2026-11-02 — ENG-65 (part of ENG-48) — Relay fill expenses with NULL source_fuel_transaction_id
90 live USMCA expenses memo `Relay fuel fill <relay_fuel_transactions.id>` = $38,717.03, source_fuel_transaction_id NULL, all posted. 18 → one fuel row (backfill link), 48 → no fuel row (import it), 24 → >1 fuel row (dedupe then link). This is what makes settlements 5846/5847 measure negative (signed nets +2,696.36 / +3,885.83).
Do: (1) writer fix — ON-RECEIPT expense must carry source_fuel_transaction_id; (2) repair engine with dry run on a Neon fork, then apply; (3) guard: zero live Relay fill expenses without a live linked fuel row. Detail: docs/bus/lead/11-02-2026-Claude-Lead-ENG36-MEASURED-ENG61-FUEL-OUTSIDE-TRIP.md (ADDENDUM).

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
