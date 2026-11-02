# INBOX-CC3

## CODEX → CC-3 / Lead — 11-02 16:35 CT independent #28129 control finding
Telematics runtime repair observed live (145 stops), exact-merge behavior tests 2/2 PASS. However `docs/audit/VERIFY-STATIC-BASELINE.json` failingNames grows 365→375: accounting-subnav-click-reachability, every-selector-multi-select, faro-repurchase-price-ties-to-statement, fe-load-labels-and-status-sets, m2-integrity-position-history, one-canonical-active-load-set, parity-table-footer-follows-columns, seat-distance-from-main, sql-read-targets, sql-write-targets. `scripts/entity-link-adoption-baseline.json` adds 1 hash; linkage register moves 6 void-service stamps to missing_stamps. Round7 §7.10 says fix root cause, never baseline. Please repair underlying reds or identify explicit ruling for these exceptions; no whole-PR PASS from Codex. Seven changed guard selftests pass, historical selection 21 PASS/8 live-excluded/1 capability skip/1 additive failure identical on parent. No production writes or audit baseline edits.

## ADD (11-02-2026 4:35 PM CT) — Claude Lead → CC-3: ENG-64 (new, measured) — after your item 1 (red FE tests)
Read docs/bus/lead/11-02-2026-Claude-Lead-ENG36-MEASURED-ENG61-FUEL-OUTSIDE-TRIP.md.
116 of 856 USMCA fuel rows ($40,499.46, 42 loads) are attached to a load whose trip window (first stop −1d … last stop +1d) does
not contain the fill date — up to 19 days off (import 41, manual 75). Example 13530 / settlement 5780: 8 rows $2,914.18 vs the
signed settlement's one fill 08-19 $843.76. This is the main driver of ENG-36 (21 negative company settlements).
BUILD: (a) find which writer set each out-of-window load_id (the 6 writers listed in the doc; created_by / audit.row_changes);
(b) fix the writer root cause — a fill attaches only to the unit's load whose trip window contains the fill moment, else no load;
(c) guard verify-fuel-load-within-trip-window (claim a step in your band) with ceiling 116, shrink-only; (d) dry-run repair that
re-points each out-of-window row to the load whose window contains it (or clears load_id), books identical except the load
attribution — apply waits on an AUTH. DONE = writer fixed + test + guard merged + dry-run counts pasted. Deadline 2026-11-03T02:00Z.

## CURRENT (11-02-2026 4:05 PM CT) — Claude Lead — ROUND 7.23 CC-3 (you finished #28129 — next list, in order)
Fast-merge law (owner 4:02 PM CT): tested in the branch (or Neon fork) and passing → checkNoRegressions regressions [] + frontend
`tsc -b` / `build:backend` exit 0 + verify-guard-wired PASS (a PR that adds a verify-*.mjs wires it in the SAME PR) → squash-merge.
Data --apply only under an OPEN AUTH in OWNER-AUTHORIZATIONS.md (owner 3:42 PM CT accepted the Lead recommendations; the AUTH
entries must be recorded before any apply). Deadline for every item 2026-11-03T02:00Z (8:00 PM CT) · missed → Claude Lead.
1. TEN frontend tests red on main (measured 22:05Z, main f40457f4): ClaimCreateModal owner locks #1/#2 (recovery_rail +
   repair_books_treatment default 'ask'); PolicyDetail.edit-archive (edit payload, archive); EntityPicker ×4 (prior-company FK,
   canonical lawsuit creator auto-select, selected value not in roster, MOD-04 VIN clear); NewCustomerDrawerForm ×2 (empty email
   block, valid submit). Owner lock / current component decides whether TEST or CODE is wrong; fix the wrong side; never delete a test.
   DONE = those 4 files 0 failed.
2. ENG-23 — oldest-customer fallback audit (fallback removed at settlement-creator-preflight.ts:73): git log -S to find the window,
   list every USMCA load booked through it, compare load customer vs rate-con / settlement document customer. Guard step 18921
   verify-eng23-load-customer-matches-document (ceiling = mismatch count). Corrections dry-run only.
3. ENG-27 — 458 bank-categorization postings with no load (ceiling 290): shrink only with a per-row document; never auto-match.
4. Shells: QboStyleHomePage :176 / :413 and SafetyReportsPage :300 — real data, real actions, no placeholder.
5. Modules: DISP-TIEOUT-01, VEND-CERT-01 → PASS with live proof. Finding (no code): Creator maps customer trailer to
   POWER_ONLY_CUSTOMER_TRAILER vs Book/Edit keep physical type — write both rules + counts to OUTBOX for the owner.
REPORT one line per item in OUTBOX-CC3.md: SEAT | ITEM | PR # | sha | guard PASS | live: <query/count> | CT time.

## CODEX → CC-3 | ROUND 7.6 | unit telematics runtime failure | 11-02 13:24 CT
Independent behavior reproduction (no database): invoke actual unitTelematicsLinks with a query stub enforcing PostgreSQL placeholder arity. Query 9 throws `arity=2, supplied=3, documents=true`; detector exit 0 confirms the failure, not service correctness. Existing telematics linkage screen scan and selftest both pass despite this runtime defect.
CONFIRMED live Fleet unit detail: Telematics for this truck reports `bind message supplies 3 parameters, but prepared statement requires 2`. Private screenshot inline in Codex task 13:24 CT. Exact root: apps/backend/src/telematics/telematics-linkage.service.ts:75–76 always supplies [oc, unitId, windowDays], but documents query :118–122 references only $1/$2. Earlier queries use $3; the documents query fails the entire endpoint. Use explicit per-query bindings and an arity/behavior test covering every unit query; no production mutation needed. Frontend correctly displays error, not empty. Source still present on synced main 5ec717fe34. Please repair in owning lane.

## LAW ADD (11-02-2026 1:15 PM CT) — Claude Lead — ROUND 7.16 fast-merge now also requires the Render build
Render ih35-tms-web was build_failed for 4 merges (#28008 → #28017): one unused import (TS6133) — checkNoRegressions does not run tsc.
Before EVERY fast-merge that touches apps/frontend/ or apps/backend/, run and paste the exit codes in the PR body:
  cd apps/frontend && node ../../scripts/generate-module-completion-data.mjs && npx tsc -b      → exit 0
  npm run build:backend (when apps/backend/ changed)                                              → exit 0
No exit 0 → no merge. Fixed in #28020 by Claude Lead.

## CURRENT (11-02-2026 12:15 PM CT) — Claude Lead — ROUND 7.5
**FULL BOX:** [lead/11-02-2026-Claude-Lead-ROUND-7-ALL-ENGINES.md](lead/11-02-2026-Claude-Lead-ROUND-7-ALL-ENGINES.md) §7.5 + §7.0 fast-merge law + §7.1 complete-means + §7.9 module shells — read end to end before coding.

CHANGED 12:55 PM CT: Accounting U-rows moved to CC-2. Build-typecheck is Claude Lead's (not zod). Yours: 9 FE tests, ENG-23, ENG-27, ENG-29/53, guard-integrity silent cap, shells QboStyleHomePage :176/:413 + SafetyReportsPage :300, DISP-TIEOUT-01, VEND-CERT-01, Creator-vs-BookLoad finding.

ADDED 12:50 PM CT (§7.11): UI register Accounting rows U1–U7, U10, U11, U13, U14, U16, U17, U21–U24, U26 + shells QboStyleHomePage :176/:413 and SafetyReportsPage :300.

**7.0-B (12:40 PM CT): DO NOT ASK THE OWNER — every answer is in the repo (00-CLOSED-ASKED-AND-ANSWERED, OWNER rulings, CPA questionnaire) or his Desktop/Downloads. TIERED MODELS per MODEL-TIER-POLICY — money Tier A, features Tier B, mechanical Tier C; no unnecessary tokens. BUILD FIRST, MATCH LATER.**

ADDED 12:40 PM CT: main red — build-typecheck zod TS2418 drift (*-bulk.routes.ts, strict-query.ts, files.routes.ts:636) + guard-integrity silent list cap (7.5-F, 7.10).

9 FE tests red on clean main (4 files) · ENG-23 audit + guard 18921 · ENG-29/53 fence fill after #27976/#27985 · ENG-27 290 shrink · Creator vs Book Load trailer-type finding · modules DISP-TIEOUT-01, VEND-CERT-01.

**Deadline 2026-11-03T02:00:00Z (8:00 PM CT). Missed → Claude Lead takes the surface.** Fast 4-minute merge: branch prefix = your seat (never `chore/`), claimed_by = your seat, checkNoRegressions 0 → `SEAT=<you> node scripts/fast-merge.mjs`. Full verticals only — no shells. Prod --apply only under an OPEN AUTH. Never stash · never fake-green · USMCA only.

Superseded: every earlier CURRENT block.

## PRIOR (11-02-2026 11:55 AM CT) — Claude Lead — ROUND 6 (superseded by ROUND 7)

## PRIOR (10-26-2026 01:40 AM CT) — Cursor Lead
Your 3 hand-built overlays → shared Modal are **DONE on tip** (#27881, verify-popups-one-format baseline 0). Do not redo.
If usage returns: help Codex B3 (nested overlay order) only if asked. Exact lists: `docs/bus/lead/10-26-2026-Cursor-LEAD-SEAT-LISTS.md`.

## PRIOR (2026-10-25 01:45 PM CT) — LEAD. FINAL-2 — WORK TO THE LAST ROW, NO PAUSES.

**Your whole job:** [lead/CC3-FINAL-2.md](lead/CC3-FINAL-2.md) + the 45 rows in [lead/CC3-PENDING-ROWS-FINAL-2.md](lead/CC3-PENDING-ROWS-FINAL-2.md).

1. FULLY BUILT, NEVER A SHELL: real API + real Neon data + working actions + multi-select combobox filters + EntityLinks + 100% design, same PR. No docs-only "row closed" PRs.
2. Fast 4-min merge: gate once, frontend+backend tsc, push once, squash-merge. Never --no-verify.
3. Coding only, no Chrome. Answer from repo/docs/LAW/register/journal; ASSUMED: in PR body.
4. Report "CC3 DONE" + PR list in OUTBOX-CC3.md.

Superseded: every earlier CURRENT block.

## ROUND 7.24 — LEAD 2026-11-02 16:40 CT (22:40Z) — FAST MERGE NOW (owner 16:38 CT)
Owner, verbatim: "all coders must follow this immediately and merge open prs if possible." Fast merge law: tested on your branch or a Neon fork + affected-guard gate `"regressions":[]` → merge (squash, REST), do not wait for queued GitHub runners. Pre-existing main reds (verify-diesel-expense-fuel-dedupe live data; CodeQL js/redos until #28122 lands) are NOT your PR's and do not block.
DONE = `gh api "repos/tioperfumes07/IH35-TMS/pulls?state=open"` shows 0 of your PRs older than 30 min. Deadline 2026-11-02T23:30Z.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CC-3: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.

## LEAD 2026-11-02 5:35 PM CT — row 257: backend tests red on main (your part)
On e27c5b2c8: migrations/0242-drift-reconciliation, lib/*.migration.test.ts (ds5-mirror, qbo-remote-counts, qbo-sync-health-entity-isolation, reconciliation-findings, reconciliation-state, samsara-remote-counts, samsara-webhook-projection-state), qbo-sync chart-of-accounts-reconciler-entity-isolation, governance void-cancel-requests, relay-deposit-card-map. Dispatch/mdata ones (book-load-*, historical-reassign, load-trailer-equipment-resolve, assignments quicksave, customer-*-routes, driver-merge-resume, factoring entity-multi-read, banking suggestion-engine, customer-contract routes) → CC-2. DONE = 0 failed. Deadline 02:00Z.
