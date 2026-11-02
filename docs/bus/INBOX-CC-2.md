# INBOX-CC2

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
