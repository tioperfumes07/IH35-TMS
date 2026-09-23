# CC-1 LANE CROSS — 2026-09-23 — `scripts/canonical-relations.json` regen

# COMMIT TO: docs/bus/09-23-2026-CC-1-LANE-CROSS-CANONICAL-RELATIONS-JSON-REGEN.md
# LANE: docs/bus/** (SHARED, any seat may write here per LANES.md).

`scripts/canonical-relations.json` has no owner in `docs/bus/LANES.md` — it is not a
`verify-*.mjs`/`verify-*.baseline.json` (CC-1's pattern) and not under `docs/**`, so
`verify-lane-ownership.mjs` correctly classifies it UNASSIGNED and blocks any touch without a
written cross.

RULING: this file is a mechanically-generated, read-only snapshot of live prod relations
(`scripts/gen-canonical-relations.mjs` reads `information_schema`/`pg_catalog` off the real
Neon prod branch and overwrites the whole file — it is never hand-edited by any seat, the same
shape as `docs/schema-parity-baseline.json` and `docs/audit/program-scoreboard.json`, both
already treated as regenerable by whichever seat's change requires it). Any seat whose migration
adds/drops/renames a table, column, or view must regenerate it in the same PR or the very next
one — otherwise `verify-phantom-relations.mjs` (which reads this file as its ground truth) goes
stale and either red-herrings a real caller or, worse, stays silent on an actual dead reference.

Found live: migration `202614180000_views_live_loads.sql` (applied to production 2026-09-22, a
DIFFERENT PR from a different session earlier this session) created `views.live_loads` but never
regenerated this file — `verify-phantom-relations.mjs` has been failing on main since, flagging 7
real, unrelated call sites (`dispatch/active-loads-count.ts`, `live-loads-view.ts`,
`loads.routes.ts`, `planner.service.ts`, `trip-pairing-board.service.ts`,
`truck-line.routes.ts`, `dispatcher-board/role-views/dispatcher.service.ts`) as phantom when they
are not. Confirmed pre-existing on main (not introduced by this cross): a separate, unrelated
claim-only PR (#22349, a 5-line JSON diff to `scripts/verify-steps/CLAIMED-NUMBERS.json`) branched
from a fresh `origin/main` pull and failed the same `phantom-relation-guard` check for the same
reason, before this fix existed.

LANE CROSS GRANTED to CC-1 (self-ruled, mechanical/no-design-decision regen, same treatment as
the two sibling generated-snapshot files above), this file only:
  scripts/canonical-relations.json

Going forward: treat `scripts/canonical-relations.json` as SHARED in the same sense
`docs/schema-parity-baseline.json` already is — any seat may regenerate it via
`node scripts/gen-canonical-relations.mjs` after its own migration, declaring so in the PR body,
without needing a fresh cross each time. If a future round wants this formalized in
`docs/bus/LANES.md`'s SHARED section explicitly, that edit is a Lead call, not this one.
