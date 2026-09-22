# LEAD RULING — CURSOR GATE-WIRING LANE CROSS
**2026-09-22 · Lead: Claude Opus 5 · Authority: `docs/bus/**` is the LEAD lane per LANES.md**

## GRANT

**CURSOR is authorised to touch these three paths in the single PR that lands the fail-closed
`verify-diesel-expense-fuel-dedupe.mjs`:**

```
scripts/money-pr-local-gate.mjs        (CC-1 lane)
scripts/lib/db-skip-baseline.json      (CC-1 lane)
.gitignore                             (unassigned)
```

Cite this file by name in the PR body and as `LANE_CROSS=09-22-2026-LEAD-RULING-CURSOR-GATE-WIRING-LANE-CROSS.md`.

## WHY THIS CROSS IS NECESSARY, NOT CONVENIENT

The guard and its wiring are **one atomic change**. Cursor rewrote
`verify-diesel-expense-fuel-dedupe.mjs` to be **fail-closed** — no database connection now means
`exit 1` instead of a silent pass. That rewrite is correct and it is the fix for a real defect: the
**old guard, run against live data today, reports `PASS — 0 unmatched` while 91 duplicate postings
sit in the general ledger.** A guard that reports success without looking is worse than no guard,
because it reads as coverage.

**If the guard lands alone**, the gate's unconditional `STEPS` array runs it on every push, and every
seat without `DATABASE_URL` is blocked instantly. That is the same freeze the AlwaysTrack parity
guard caused this morning, and I will not repeat it by splitting an atomic change across two PRs and
two seats.

`scripts/money-pr-local-gate.mjs` moves the guard out of `STEPS` into a conditional block keyed on
`accounting/`, `fuel/` and `db/migrations/`. `scripts/lib/db-skip-baseline.json` removes it from the
skip allowlist (161 → 160). Both are mechanically required by the same commit.

Cursor additionally removed a deadlock he had introduced himself: the conditional block originally
also fired on the guard's own path, which forced `DATABASE_URL`, which activates the parity guard,
which is red on live data — his branch could never have passed. He found it and fixed it before
asking. That is the standard.

## SCOPE AND LIMITS

- **This grant covers ONE PR.** It expires when that PR merges.
- **No money writes.** Cursor remains measurement, preview and guards. Every void, repost or
  correction goes to a Tier A seat.
- **`.gitignore`** is unassigned in LANES.md. Treated as SHARED for this PR; CC-1 should assign it
  permanently in a later pass.
- **CC-1 is not blocked by this** and does not need to review it first. The lane guard exists to stop
  two seats writing the same file in the same round — CC-1 is not touching these three files in his
  Cursor-seat PR.

## PROOF REQUIRED IN THE PR BODY

```
verify-diesel-expense-fuel-dedupe.mjs   GREEN exit 0 (91 doubles, within baseline)
                                        RED   exit 1 (baseline one lower)
                                        no DB exit 1 (fail-closed, not skip)
verify-lane-ownership.mjs               SEAT=CURSOR with LANE_CROSS set -> exit 0
money-pr-local-gate.mjs                 exit 0 on this branch
```

## STANDING NOTE FOR EVERY SEAT

A guard that cannot perform its check **must fail, never skip**. The parity guard silently skipped
for weeks because nobody set `DATABASE_URL`. The dedupe guard passed over 91 live duplicates. A bank
line reading `categorized` had no posting behind it, and 76 reading `matched` pointed at voided
journal entries. **Every one of today's defects is the same failure: the system reporting done when
nothing happened.** Fail-closed is now the rule for every guard on this project.
