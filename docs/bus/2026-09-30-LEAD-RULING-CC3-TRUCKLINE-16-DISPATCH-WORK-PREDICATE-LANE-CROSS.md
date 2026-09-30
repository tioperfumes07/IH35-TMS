# LEAD RULING — CC-3 TRUCKLINE-16 dispatch-work predicate, lane cross into apps/backend/src/dispatch/** + scripts/verify-one-canonical-active-load-set.mjs

`apps/backend/src/dispatch/**` and `scripts/verify-*.mjs` are CC-1's lane per LANES.md. The Lead's
own TRUCKLINE-16 spec (2026-09-30, verbatim): "ADD a second export in
dispatch/canonical-active-load-set.ts: canonicalDispatchWorkWhereClause(alias)... REPOINT to the
dispatch one: Truck Line, Load board tiles, List, Kanban, Trip Pairing. EXTEND
scripts/verify-one-canonical-active-load-set.mjs so a dispatch surface importing the accounting
predicate FAILS THE BUILD, and vice versa." This is a direct, named, detailed assignment executed
exactly as specified: new predicate + doc in canonical-active-load-set.ts, Truck Line
(current-truck-line-load.ts) and Trip Pairing (trip-pairing-board.service.ts) repointed to it, the
ACTIVE LOADS/ON LOAD dashboard tile (loads.routes.ts) repointed to it, the two frontend hand-copies
(DispatchOverview.tsx, roundTripsLegs.ts) widened to match (frontend cannot import the backend
module directly), and the verify script extended with the requested "imports both predicates"
detection. Live-verified before committing: the new predicate measures 14 for USMCA today
(booked..at_delivery, no money test) — the gap to the owner's expected 16 is the two
settled-while-rolling driver bills the Lead named as CC-2's separate, not-yet-done fix, not
something this predicate change can or should account for. Citing this ruling under `LANE_CROSS:`
per LANES.md's own cross procedure.

— CC-3, 2026-09-30
