# STOP-THE-THRASH — Work Order (2026-07-17)

## What was happening (honest)

You **were** advancing — Relay ingest, safety Neon columns, phantom-column ratchet, financial merges, OPEN-FE batch — but progress felt like zero because:

1. Almost all of it is **plumbing** (guards, wiring, migrations), not new screens.
2. A **rebase treadmill** ate wall-clock: every merge moved `main`, and nearly every open PR edits the same hot files to register a guard.

### Verified live (this session)

| Signal | Reality |
|---|---|
| Open PRs on GitHub | **~13** (not 110) |
| Local worktrees | **~125** — ~110 are unmerged *local* branches; purging cannot drain GitHub |
| Hot-file contention | **12/13** open PRs touch ≥2 of `package.json` / `locked-guards.yml` / `ci.yml` |
| Bottleneck | Shared-file conflict × moving `main` × parallel agents — **not** build CPU |

Worktree purge only removed **3** safe trees. The other 110 KEEP-UNMERGED hold real (or stale) WIP — cleanup ≠ fix.

## What Claude Agent got right

- Shared-file guard registration is the treadmill.
- WIP freeze + serialize merges is mandatory.
- More parallel agents on overlapping files makes this **slower**.
- Neon on #2650/#2658 and #2649 MY_ACCOUNTANT closeout are **DONE** — do not redo.

## What Claude Agent got wrong (do not ship as written)

A naive CI step:

```bash
for f in scripts/verify-*.mjs; do node "$f"; done
```

would **break** the repo: ~1000+ guards, many need DB / flags / args, many are exempt, many are selftest-only. That is a patch that creates a worse outage.

### Real root fix (FIX 1)

`scripts/verify-steps/` is **already** auto-discovered by `verify:pre-commit` (`readdirSync`).  
`verify-guard-wired` previously required **package.json AND CI** — so agents edited `package.json` + often `locked-guards.yml` for every new guard.

**Change:** CI execution alone = fully wired. `package.json` is optional local convenience.

**New guard recipe (zero shared-file edits):**

1. Add `scripts/verify-<name>.mjs`
2. Add `scripts/verify-steps/<NNN>-verify-<name>.mjs` that imports/runs it  
3. **Do not** edit `package.json`, `locked-guards.yml`, or `ci.yml`

Shipped in PR: `fix/guard-wire-via-steps-only` (this work order’s FIX 1).

## FIX 2 — Hard WIP freeze (NOW)

- **STOP** opening new PRs / OPEN-FE / branches until open PR count **≤ 3**.
- Drain existing queue **serialized**: rebase → green → merge, **one at a time**.
- After each merge, rebase **only the next** PR (not the whole set).
- Triage local unmerged worktrees: merge PR, close superseded, or delete branch — stop babysitting dead trees.

## FIX 3 — Merge discipline

- Cursor owns push/rebase/merge. GUARD verifies live; GUARD does not push.
- Migrations: Neon-apply first, then merge. (#2650/#2658 already applied — merge on green only.)
- Optional: GitHub merge queue if plan supports it — helps serialize; does **not** replace FIX 1.

## Definition of done

- [ ] FIX 1 merged: new guard PR adds only `scripts/verify-*.mjs` + `verify-steps/*` and stays green without touching hot files.
- [ ] Open PR count ≤ 3.
- [ ] Local unmerged worktrees triaged (no 100+ babysitting set).
- [ ] 59-bug sweep still **HOLD** until Dependabot lands (agreed order).

*Corrected by Cursor 2026-07-17 — keep Claude Agent’s diagnosis; replace naive glob with verify-steps + guard-wired rule change.*
