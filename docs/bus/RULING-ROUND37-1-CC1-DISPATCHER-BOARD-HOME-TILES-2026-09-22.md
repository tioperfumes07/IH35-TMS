# LANE_CROSS RULING — `dispatcher-board/role-views/dispatcher.service.ts` — CC-1 — 2026-09-22

`apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts` has no entry in
`docs/bus/LANES.md` — `verify-lane-ownership.mjs` reports it `UNASSIGNED`, not owned by another
seat. This file is the Home dashboard's "OPEN LOADS" / "late" / active-loads-list backend — one of
the exact surfaces the Lead named, verbatim, across the ROUND 36.1/37.1/38.2 chat rulings that are
this branch's own mandate:

> ROUND 37.1 (Lead, live Chrome walkthrough, 2026-09-22): "HOME: OPEN LOADS 22 ... In-flight loads
> running late 19 ... EXPECTED: 5 open_dispatch · 4 pre_settlement. EVERY ONE OF THESE IS WRONG.
> ... THE VIEW MUST BE THE SOURCE FOR THESE TILES AND THEIR DRILL-THROUGHS TOO."
>
> ROUND 38.2 (Lead): "DONE = THE TABLE, EVERY SURFACE, AGAINST 5 AND 4: Home OPEN LOADS · Home
> late · ACTIVE LOADS · ... ."

This ruling authorizes CC-1 (dispatch/accounting lane) to touch this one file, for this one
purpose — wiring the same `views.live_loads` structural fix (ROUND 36.1,
`docs/manuals/02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md`) into the Home dashboard's KPI and
active-loads-list queries — as a `LANE_CROSS`. No other file under `dispatcher-board/**` is
touched by this branch.

`LANE_CROSS=docs/bus/RULING-ROUND37-1-CC1-DISPATCHER-BOARD-HOME-TILES-2026-09-22.md`
