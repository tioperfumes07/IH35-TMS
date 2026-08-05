---
description: Claude's serial ship sequence — tip-main + one CLAIMED PR + Claude title/body + preflight before every push (owner 2026-08-05)
alwaysApply: true
---

# RULE 36 — CLAUDE SERIAL SHIP SEQUENCE (owner law — permanent)

**Owner word (2026-08-05):** Claude is ~1/10 red and almost never needs rebase thrash across 50+ PRs. Cursor was 1/1 red / constant CONFLICTING. Inspect Claude’s method, implement it, make it permanent. Stop turning 8-minute lands into 3-hour rebase loops.

**Companions:** Rule 29 (local gate) · Rule 30 (Claude-green body) · Rule 32 (`Cursor-` title) · Rule 33/standing · Rule 35 (no CI babysit) · `docs/specs/DELIVERY-METHOD-LOCKED.md` §9.2.

## Why Claude stays green (measured 2026-08-05)

| Claude does | Cursor was doing (defect) |
|-------------|---------------------------|
| Branch from **tip `origin/main`** every time | Stack / leave branches 1+ behind while main moves |
| **One** feature PR; merge; then next | Parallel EntityPicker PRs all editing `CLAIMED-NUMBERS.json` → perpetual CONFLICTING |
| Title: `Claude-1- fix(scope): ID — one-line defect` | Thin `Cursor- fix: short name` (no scope, no FINDING, no defect sentence) |
| Body: FINDING-first prose ROOT CAUSE (prod-measured) → FIX → GUARD → LIVE PROOF artifacts | `## Summary` / “Made with Cursor” / DRAFT WIP notes / weak LIVE PROOF |
| Local gate PASS → **one** push → stop | Push → discover reds in CI → rebase → babysit → 3 hours |
| Rarely mid-flight rebase (base was tip at push) | Open 2 CLAIMED PRs → every main merge forces both to rebase |

## HARD sequence (every Cursor PR — no shortcuts)

```text
0. git fetch origin main
1. COUNT open non-Dependabot feature PRs. If ≥3, merge/park before opening another
   (P0 main-unblock excluded). Cursor may have AT MOST ONE open PR that
   touches scripts/verify-steps/CLAIMED-NUMBERS.json.
2. git checkout -B cursor/<slug> origin/main     # NEVER stack on another open PR
3. ONE ranked FAIL: code + sibling guards + new guard (+ CLAIMED-REGEN if needed)
4. Write /tmp/pr-body.txt from docs/templates/CLAUDE-GREEN-PR-BODY.md
   — start FINDING: at column 0; NO ## Summary; NO "Made with Cursor"; NO "DRAFT"
5. Title EXACT shape:
   Cursor- fix(<module>): <FINDING-ID> — <one-line defect>
   Example: Cursor- fix(safety): SAF-MEET-TRAIN-DRIVER-PICKER — meetings/training used limit:200 roster
6. git fetch origin main && git rebase origin/main   # ALWAYS immediately before push
7. node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt
   — MUST PASS (includes behind-main = 0)
8. ONE push (hooks ON). gh pr create --body-file … as READY (never draft for finished work)
9. Do NOT open a second CLAIMED-touching PR until this one is merged or closed
10. If main advances and PR becomes CONFLICTING: rebase same turn (fetch→rebase→preflight→force-with-lease)
    — never leave CONFLICTING overnight / across turns
```

## Mechanical teeth

`scripts/ops/cursor-ship-preflight.mjs` **FAILS** if the branch is behind `origin/main` (after an internal `git fetch`). Fix = rebase, re-run preflight, then push. No “push and hope.”

## Forbidden forever

- Opening PR #2 that edits `CLAIMED-NUMBERS.json` while PR #1 that edits it is still open
- Pushing while `behind > 0` vs `origin/main`
- Stacking on another open feature branch
- `git reset --soft origin/main` (Rule 30 — deletes other guards)
- Title without `fix(module): FINDING — defect`
- Babysitting CI instead of local preflight (Rule 35)
- Leaving finished work as GitHub **draft**

## Tie-breakers

Parallel WIP < serial Claude land · rebase theater < tip-main before push · thin title < Claude title · 3-hour merge < 8-minute green.
