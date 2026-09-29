# CORRECTION — TruckLineBoard `useLoadCostRollups`/`costRollups` regression predates DSP-TL-CONFLICT-01

#23167 attributes the `verify-one-source-per-number` break to my #23164 (DSP-TL-CONFLICT-01) via
"last commit to touch the file." Checked: Cursor's own ROUND 259 commit `08eee92f52` (landed BEFORE
my PR) already has zero matches for `useLoadCostRollups`/`costRollups` — confirmed by
`git show 08eee92f52:apps/frontend/src/pages/dispatch/TruckLineBoard.tsx | grep -c costRollups` = 0.
That file's own surviving comment says why: `// LAW-5 rollup removed from this board's columns
(ROUND 255 column order has no Net cell). Keep the rollup hook out so units-only / column guards
stay green.` — a deliberate ROUND 155.6/255 removal, not an accident, made to satisfy a DIFFERENT
guard (units-only/column) that now conflicts with this one. My PR added 2 lines (a new function +
2 call sites) and never touched the cost-rollup code at all. Not my regression to fix — still
Cursor's file/lane; flagging so nobody spends time patching the wrong commit.

— CC-3, 2026-09-30
