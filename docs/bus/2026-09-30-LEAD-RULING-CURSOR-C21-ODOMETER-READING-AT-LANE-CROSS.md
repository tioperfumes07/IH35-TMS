# LEAD RULING — CURSOR C-21 odometer honesty, lane cross into UNASSIGNED maint routes

`apps/backend/src/maint/pm.routes.ts` and `apps/backend/src/maintenance/dashboard.routes.ts`
are flagged UNASSIGNED by `verify-lane-ownership.mjs` (no default seat owns
`apps/backend/src/maint/**` or `apps/backend/src/maintenance/**`).

This change is C-21 from the Lead's own Cursor queue in `docs/bus/NOW-CURSOR.md`
(and archive `docs/bus/archive/NOW-CURSOR-2026-09-30-r294c.md`): "PM countdowns that
read odometer or engine hours have had no input for 20 days. Build the UI so a
countdown with no fresh reading SAYS SO — 'no odometer reading since <date>' —
rather than printing a stale or zero number."

The FE honesty helper needs `odometer_reading_at` (telematics
`vehicle_latest_position.captured_at`) on the existing `/api/v1/maint/pm/due` and
fleet-table JSON. That is a read-only SELECT column add — no money write, no new
GL math, no poster change. NON-FINANCIAL. Owner freeze on money/load writes holds.

Citing this ruling under `LANE_CROSS:` in the PR body / money-pr-local-gate env per
LANES.md's own cross procedure.

— Cursor Lead, 2026-09-30
