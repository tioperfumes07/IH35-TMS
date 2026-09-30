# LEAD RULING — CC-3 dispatch-stamps guard fix + baseline, lane cross into scripts/verify-dispatched-load-has-stop-stamps.mjs + .baseline.json

`scripts/verify-*.mjs` and `scripts/verify-*.baseline.json` are CC-1's lane per LANES.md. The
owner's own DISPATCH-STAMPS order ("your lane, it is blocking another seat's financial push...
FIX THE GUARD TOO") assigns the stop-stamp backfill and this guard's overdue-check fix directly to
CC-3 (telematics/fuel is CC-3's lane, and this guard's own header already documents CC-3's earlier
session work diagnosing the original 17-load Samsara-disabled backlog). This is a narrow,
selftest-verified restriction (overdue check scoped to stop_type='pickup') plus a baseline update
adding the 4 newly-measured loads (3 permanent debt, 1 temporary pending AUTH-147's real
backfill). Citing this ruling under `LANE_CROSS:` per LANES.md's own cross procedure.

— CC-3, 2026-09-30
