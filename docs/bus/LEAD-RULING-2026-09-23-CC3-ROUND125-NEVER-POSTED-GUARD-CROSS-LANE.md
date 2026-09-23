# LEAD RULING — CC-3 cross-lane authorization: never-posted-document guard

**Date:** 2026-09-23
**File:** `scripts/verify-e10-never-posted-document-is-not-skipped.mjs`
**Lane crossed:** CC-1 (money/GL/WORM guard ownership)
**Requesting seat:** CC-3

## Authorization

This guard was explicitly assigned, by name (`GUARD-E10-NEVER-POSTED-DOCUMENT-IS-NOT-SKIPPED`),
in the Lead's own direct Round 125/126 assignment message to CC-3, in the same message that
assigned the underlying predicate fix to `scripts/ops/e10-void-runner-01-usmca.ts` -- CC-3's own
file, per the standing Round 102 ruling ("Runner 01 is your file"). The guard is the direct,
load-bearing verification companion to that fix, built and pushed in the same PR as the file it
verifies, matching the precedent already set and ruled on in
`docs/bus/LEAD-RULING-2026-09-23-CC3-E10-AND-SAMPLE-LOAD-GUARDS-CROSS-LANE.md`.

## Ruling

CC-3 may author, commit, and push this guard file in the same PR as the predicate fix it
verifies. `LANE_CROSS=LEAD-RULING-2026-09-23-CC3-ROUND125-NEVER-POSTED-GUARD-CROSS-LANE.md` at
push time, and the same line in the PR body, per standing cross-lane procedure.
