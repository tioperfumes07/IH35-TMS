# CODEX — ENGINE WAVE ASAP — 10-26-2026 ~7:30 AM CT (Cursor Lead)
**Goal:** burn down the remaining ~58 OPEN engines + finish the 314-row register honestly. Fastest path = **measure-close first, then horizontal money writers**. No shells. No stash. No fake-green.

## STATUS UPDATE — 10-26 ~3:30 PM CT (Cursor Lead)
CLOSED — do not redo: ENG-01/02/03/05/09/10 (Lead #27896); ENG-11/14/63 (Codex #27900); ENG-07 CODED (#27901 guard 18802).
ENG-04 CODED writer: historical_backfill never credits 2170; guard 18809 PASS; ops dry-run `scripts/ops/2026-10-26-eng-04-2170-advance-reclass-dry-run.mts` → 3 PROPOSE_RECLASS / 3 NO-EVIDENCE / 6 BANK_AMBIGUOUS; **257596¢ residual until Lead applies**.
NEXT for Codex: ENG-08 live proof, ENG-12 retype (81 other), ENG-17 Faro residuals, ENG-13/22 trailer; flip ENG-07 DONE-LIVE after tip deploy.

USMCA only `5c854333-6ea5-4faa-af31-67cb272fef80`.  
Prod: `DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)"` inline; every SQL `SET LOCAL app.bypass_rls='lucia'`. Never print the URL.

Merge every passing PR immediately:
```
git push --no-verify -u origin <branch>
node scripts/fast-merge.mjs --branch <branch> --title "FINDING: …" --body-file <file>
```
Body: ROOT CAUSE / FIX / GUARD / REMAINING + `LIVE PROOF: <cmd> exit 0` (or `UNVERIFIED: <named blocker>`).

## DONE — DO NOT REDO
- Banking B1–B4 (#27882 / #27885 / #27886 / #27889)
- C2 load-transition hooks (#27895) — circular allowlist is back to outbox/qbo set (no load-transition)
- C3 popups (#27881)
- CC-1/CC-2 FINAL-4 static reds listed last night — tip re-measure 10-26 AM: **all PASS** except `escrow-ledger-row-has-load` (REQUIRES_LIVE_DB — run with prod URL)
- P0: API LIVE · migration 202616290000 (check_number 91) · miles 45/198

## STRATEGY (fastest honest)
**Do not start at ENG-63.** Order:

### WAVE 0 — MEASURE-CLOSE (hours, highest ROI) — START NOW
For each OPEN engine in `docs/bus/lead/ENGINE-REGISTER.json`, **measure tip + prod first**. If already fixed, close it in the same PR:

1. Live SQL or guard PASS with pasted exit line
2. Flip status → `DONE-LIVE` in `ENGINE-REGISTER.json` **and** matching row in `LEAD-PENDING-REGISTER.md`
3. Ensure a wired guard + selftest exists (ENG-09 law). If missing, add guard that plants the original defect
4. One PR per 3–6 closed engines (or one engine if money-touching)

**Lead measured LIVE this morning (close these first — do not re-fix):**

| ID | Live proof (USMCA, 10-26 ~7:30 AM CT) | Action |
|---|---|---|
| **ENG-01** | `closed_unposted=0`; P-0113/P-0117/P-0119 all `closed\|posted=true` | DONE-LIVE + guard that refuses close without posting (if not already) |
| **ENG-03** | `escrow_total=62 with_load=62` | DONE-LIVE; `verify-escrow-ledger-row-has-load --live` PASS |
| **ENG-05** | `verify-no-swallowed-db-error-in-transaction` OK — 122/122 baseline | DONE-LIVE (was 122→125; tip is back) |
| **ENG-09** | `verify-engine-register-closed-by-guard PASS` (8 surfaces) | DONE-LIVE |
| **ENG-02** | load 13574 bill_gross=95755; `load-cost-rollup.sql.ts` sums `driver_bills.gross_amount_cents` | DONE-LIVE |
| **ENG-10** | `verify-no-live-duplicate-documents PASS — 0 groups` | DONE-LIVE (still: each group verdict if any appear) |

Paste the exact commands + counts in the PR LIVE PROOF.

Then continue WAVE 0 for ENG-02, 04, 06–08, 11–18, 22–63: measure each; close or keep OPEN with the failing query.

### WAVE 1 — MONEY WRITERS (horizontal, one PR each, after WAVE 0 batch)
Code only what WAVE 0 proves still broken. Priority order (money / owner pain):

1. **ENG-02** — MEASURE-CLOSED by Lead (rollup already uses gross). If any surface still reads A/P accrued, fix that surface + guard.
2. **ENG-04** — 2170 Driver Net-Pay Clearing residual — tie to open net pay; clear through documents (no silent JE).
3. **ENG-08** — every lumper advance since `0f1f83233e` posts as that load’s lumper expense (prod check + writer fix).
4. **ENG-11** — rate change replaces linehaul, never stacks (G10; $30,170 overstated).
5. **ENG-12** — deduction types not all `other`; fine + I-94 → correct accounts.
6. **ENG-17** — 1090 / 2510 residuals document-by-document (rows 78/79). Large; batch by Faro advance.

### WAVE 2 — DISPATCH / DATA INTEGRITY
7. **ENG-07** — Book/Edit Load refuses city-only stop (no street/ZIP); guard + selftest.
8. **ENG-13 / ENG-22** — trailer choice / equipment_types resolution.
9. **ENG-14** — driver bill without unit (1 of 209).
10. **Row 264 miles** — if still ~45/198 after cron ticks, fix GPS-dwell / odometer path (no manual fill script).

### WAVE 3 — PLATFORM / GUARD HYGIENE
11. **ENG-06** — merge overlapping spine guards.
12. **ENG-18** — prepare-commit-msg amend vs new.
13. **ENG-28** — posting single door (`posting-line-writer` fold-in).
14. Wire ENG-09 list growth: every DONE-LIVE engine must appear in `verify-engine-register-closed-by-guard` register array OR a dedicated per-engine guard wired to a step.

## HARD RULES
- Never `git stash`. Never weaken baselines/ceilings. Stale guard → new contract + selftest planting the old defect.
- AUTH-453 Dreamline discounts = **OWNER-ONLY** (paused). Skip.
- ENG-21 (load 13699 street) = **OWNER** supplies address — skip until he does.
- Transportation / Trucking frozen — USMCA only.
- Report each close: `CODEX | ENG-XX DONE-LIVE | PR # | sha | guard PASS | live count`

## LEAD (Cursor) IN PARALLEL
- Closes the five LIVE-proven engines above if Codex has not started WAVE 0 yet
- Attacks ENG-02 / ENG-07 next
- Merge-watcher: only merge **tested** app PRs (ignore dependabot unless asked)
- Keeps `~/Desktop/IH35-CLAUDE-JOURNAL.md` current

## SUCCESS METRIC (today)
- ENGINE-REGISTER OPEN count **58 → ≤40** by end of WAVE 0+1 (measure-close + at least ENG-02/04/07/08 coded)
- Every close has LIVE PROOF, not “coded”
- Register file statuses match tip (stop lying to the owner)
