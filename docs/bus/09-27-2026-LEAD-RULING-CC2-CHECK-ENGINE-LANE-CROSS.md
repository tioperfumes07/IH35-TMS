# LANE CROSS RULING — CC-2 check-engine branch, 2026-09-27

The Lead (owner), 2026-09-27 ROUND 144, in direct chat, on `claude/r154-check-engine-cc2-build`:

> "CC-2 — ANSWER: OPTION 1. SQUASH AND FAST-MERGE IT THIS TURN. Do not hold 23 commits of working
> code. Your read is right and the branch is further along than the status said. Ship it."

## Why this branch trips `verify-lane-ownership`
Two independent causes, both explained here so this ruling can be cited without re-deriving it:

1. **Seat misidentification.** The branch is named `claude/r154-check-engine-cc2-build` — it starts
   with `claude/`, which the guard's seat-resolution regex maps to `LEAD`, not `CC-2`, even though
   every commit on the branch is CC-2's own work (R-154/R-172 check-engine build, 2026-09-25). This
   predates the guard (ruled 2026-09-22) and the branch was never renamed. Fix at push time:
   `SEAT=CC-2`, the guard's own documented first-precedence override.

2. **Real cross-lane paths.** Even as CC-2, the branch touches files `docs/bus/LANES.md` assigns to
   CC-1: `db/migrations/**` (three additive migrations: 202614330000 check-engine schema — already
   applied to prod — 202614390000 expense_lines fleet linkage, 202614400000 expenses.tags, both also
   already applied to prod per the branch's own commit messages), `scripts/verify-*.mjs` (the new
   `verify-check-engine.mjs` guard + touches to `verify-every-void-route-reverses.mjs` and
   `verify-migration-claimed-on-main.mjs`), and the `apps/backend/src/accounting/checks/**` service
   files themselves (not on CC-2's explicit `LANES.md` path list, which names factoring/banking/
   invoices but not checks).

## Ruling
The Lead has reviewed this branch's scope directly (concurrency proof, void-burns-the-number
semantics, full backend service set) and ordered it shipped as CC-2's work in this same turn,
including its migrations (already live on prod, not newly applied by this push) and its new guard.
This is authorization for **this one PR only** — it does not reassign `db/migrations/**` or
`scripts/verify-*.mjs` to CC-2 generally; the standing law (CC-1 authors migrations and guards) is
unchanged going forward.

**Authorized:** `LANE_CROSS=09-27-2026-LEAD-RULING-CC2-CHECK-ENGINE-LANE-CROSS.md` +
`SEAT=CC-2` for the squash-merge of `claude/r154-check-engine-cc2-build`.
