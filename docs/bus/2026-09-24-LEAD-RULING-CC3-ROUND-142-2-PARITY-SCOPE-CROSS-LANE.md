# LANE_CROSS ruling — CC-3 reverting its own PR #22509 (verify-alwaystrack-parity.mjs)

**Authorization:** Lead direct ruling, `docs/bus/00-LEAD-RULING-PARITY-IS-CASE-A-AND-THE-WHOLE-
REPO-IS-GATE-BLOCKED.md` (2026-09-23 10:34 PM CT): "CC-3: do not rescope it, do not baseline it,
do not exempt it, do not weaken it. The guard is right... Your 142.2/146.3 instruction to
consider CASE B is CLOSED by this measurement." This directly supersedes and closes out the
LANE_CROSS grant `2026-09-24-LEAD-RULING-CC3-ROUND-142-2-PARITY-SCOPE-CROSS-LANE.md` that
authorized the original (wrong) rescope in PR #22509.

## Scope of the cross

One file: `scripts/verify-alwaystrack-parity.mjs` — reverting PR #22509's scope-partition change
back to its original, correct logic (arms on live loads alone). Same file, same authorization
chain (owner/Lead direct grant to CC-3 by name) as the original PR — reverting one's own mistake
under the same standing grant, not a new cross.

## Ruling

CC-3 may author, commit, and push this revert. `LANE_CROSS=2026-09-24-LEAD-RULING-CC3-ROUND-
142-2-PARITY-SCOPE-CROSS-LANE.md` at push time, and the same line in the PR body.
