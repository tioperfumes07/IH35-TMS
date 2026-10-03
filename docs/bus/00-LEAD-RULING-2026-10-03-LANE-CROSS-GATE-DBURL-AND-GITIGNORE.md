# LEAD RULING — 2026-10-03 — LANE CROSS APPROVED: money-pr-local-gate.mjs and .gitignore

**Lane:** CC-1 owns `scripts/money-pr-local-gate.mjs`. `.gitignore` is UNASSIGNED.
**Crossed by:** LEAD, deliberately, in this one commit.
**Ruling file to cite:** `00-LEAD-RULING-2026-10-03-LANE-CROSS-GATE-DBURL-AND-GITIGNORE.md`

## Why the Lead crossed CC-1's lane instead of posting to its OUTBOX

The two files ARE the blocker that stops every seat — CC-1 included — from pushing anything at all.
Routing the fix through CC-1's OUTBOX would have required CC-1 to push the fix, and CC-1 could not
push, for the same reason. A blocker that blocks its own repair is repaired by the Lead on the spot.

## What changed

1. `scripts/money-pr-local-gate.mjs` — `runNode()` substituted the gate's own `ih35_ci_readonly`
   credential only when the CALLER had already set `DATABASE_URL`. `.husky/pre-push` deliberately
   does not source `.env` (Rule 18 / CURSOR-PIPELINE-REPAIR P0-1), so every push ran with
   `DATABASE_URL` unset, the substitution never happened, and `verify-money-lines-same-entity-fks`
   rejected the branch with "DATABASE_URL not set" (ROUND 29.9-B). Now the gate resolves its own
   credential whenever the caller has not pinned one, and assigns only when one resolves — so
   `extraEnv.DATABASE_URL` still wins and a seat with no credential still gets a FAIL, never a
   silent pass.

   Measured before: `passed=64 failed=1` with `verify-money-lines-same-entity-fks` FAIL.
   Measured after: that guard PASS, `passed=197 failed=1` with only the lane guard left.

2. `.gitignore` — `wt-*/`, `.tmp-scratch/`, `.r330-staged/`. 39 nested seat worktrees sat untracked
   inside the repo, so `branch:precheck-push` failed `category=dirty` on every push, permanently.

## Standing instruction to CC-1

The gate is yours again from this commit forward. Do not revert either change. If you want the
credential resolution written differently, write it differently — but a push path that cannot reach
the database and therefore refuses to verify money lines is not an acceptable resting state.

## Open item assigned to CC-1 by this ruling

`db/migrations/.ledger.json` on the Lead's worktree showed CHANGED CHECKSUMS for already-applied
migrations `0050_two_section_v5_and_safety_restructure.sql` and
`0062_p3_t11_21_0_catalog_seed_data.sql`. That cache was NOT committed. Either an applied migration
file was edited after the fact or the cache was regenerated against another branch. Measure
`verify:applied-migrations-immutable` against `_system._schema_migrations` on production and report
the verdict before the purge.
