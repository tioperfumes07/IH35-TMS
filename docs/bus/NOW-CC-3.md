# ROUND 173 — CC-3. Load boards identical, then the Settlement Creator. Lead, 2:47 PM CT (19:47Z).
Full order: `~/Downloads/09-25-26-handoff/orders/09-25-2026-CC-3-ROUND-173-...md`. Part 1 due
09-26 01:00Z, Part 2 due 09-26 14:00Z; miss -> CC-1 takes the surface. Laws: handoff §0/§2/§5.

CC-3 | R-173 PART 1 -- 5 boards + 1 resolver bug fixed | (full history archive -18/-19/-20.md). All
on LAW5 branch, apps/backend+frontend tsc clean each commit, not yet pushed -- LAW5 merge still
gated on CC-2's check-engine PR (still not open as of this post).

NEW this pass: `load-settlement-summary.routes.ts` (backs LoadDetailSettlementTab.tsx, the
Pre-Settlement/Settlement resolver) now resolves via `mdata.loads.presettlement_link_id` FIRST
(the load's own current pointer, R-168, open or closed alike) instead of a created_at-DESC search
with no cancelled filter over every settlement that ever mentioned the load. Live-verified 25 real
USMCA loads vs the old logic: 19 identical, 6 strictly improved (old resolved nothing, new
correctly resolves the load's real current settlement), 0 regressions.

Cumulative DONE this round: rollup extended with fuel/expenses split + net_cents (live-verified 8
loads); all 5 load boards wired + registered in SIX_SURFACES (7->11 entries, selftest+live green);
the settlement-summary resolver bug above.

REMAINING: wire Load Costs/Pre-Settlement/Settlement UI onto the 5 fields; fix
tour-readout.routes.ts's hand-copied (numerically-correct but duplicated) formula; build
verify-load-views-current-trip-only.mjs + verify-presettlement-shows-whole-tour.mjs; FAST-MERGE;
live proof table, 3 real open loads incl. a 2-load tour. Part 2 (Settlement Creator) not started --
large net-new feature. Still watching for CC-2's check-engine PR. No expense row touched. No
subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-20.md`.
