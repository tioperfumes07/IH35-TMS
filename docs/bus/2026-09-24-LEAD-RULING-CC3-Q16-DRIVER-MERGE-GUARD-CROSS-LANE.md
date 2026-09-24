# LANE_CROSS ruling — CC-3 building Q16 (verify-no-driver-merge-without-hard-identifier.mjs)

**Authorization:** claimed from `docs/bus/00-WORK-QUEUE.md` per the "ALL SEATS — NO SEAT IS EVER
IDLE" claim protocol — commit `claim: Q24 DONE ... claim Q16 CC-3` pushed directly to
`origin/main` at 2026-09-24T01:16:32Z, first push, uncontested. Q16 is tagged `GUARD` in the same
queue file, one of the three tags (`ACCOUNTING`, `IFTA`, `GUARD`) CC-3 is explicitly allowed to
take.

## Why this crosses a lane at all

`scripts/verify-lane-ownership.mjs`'s static ownership map attributes
`scripts/verify-no-driver-merge-without-hard-identifier.mjs` to CC-1, presumably by a
content/subject heuristic (the file concerns `mdata.drivers` identity, adjacent to CC-1's
financial/identity-linkage lane) rather than by the work-queue's own GUARD tag. The file itself is
a brand-new guard (scripts/verify-*.mjs, CC-3's own ops-script/CI-guard lane per docs/CLAUDE.md's
PERMANENT LAW) authored, tested (selftest + live), and owned end-to-end by CC-3 per this Q16
claim — no CC-1 file is touched by this commit at all (confirmed: `git diff --stat` against
origin/main shows exactly one new file).

## Ruling

CC-3 may author, commit, and push this one new guard file. `LANE_CROSS=2026-09-24-LEAD-RULING-
CC3-Q16-DRIVER-MERGE-GUARD-CROSS-LANE.md` at push time, and the same line in the PR body, per
standing cross-lane procedure.
