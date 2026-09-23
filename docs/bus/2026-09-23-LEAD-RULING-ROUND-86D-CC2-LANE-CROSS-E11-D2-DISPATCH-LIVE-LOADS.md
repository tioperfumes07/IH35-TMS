# LEAD RULING — ROUND 86D — CC-2 LANE CROSS GRANTED: E11-D2 (dispatch surfaces read views.live_loads)

Committed on the Lead's behalf, quoting his own written packets (chat + `~/Downloads/09-23-2026-
ALL-SEATS-FINISH-ALL-13-BEFORE-THE-FEED.md`, 2026-09-23) which assigned E11 boards D2->D4->D3 to
CC-2 as item #7 of CC-2's four items required before the feed, and the earlier explicit priority
packet: "E11 BOARDS — D2 then D4 then D3. Still your P0."

**GRANTED, verbatim, per the Lead's own packets:**

> CC-2   5. E20 Part B — the Mapping page             (before the merge)
>        6. item lines on screen — item | qty | rate | amount, amount read-only, dash never zero
>        7. E11 boards D2 -> D4 -> D3
>        8. deduction screens — reason + fault picker, dispute toggle, recovery register
> ...
> E11 boards D2 -> D4 -> D3. D2 is measured only; D4 and D3 are not started.

**Scope of this grant:** CC-2 may make the exact same real-view fix
(`docs/manuals/02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md`'s own pattern, already applied by
CC-1 to `dispatcher.service.ts`) to three additional dispatch surfaces named in that ruling's own
"DONE — re-measurable" table (At Risk / Late Arrivals / Planner among them) but not yet fixed:
`apps/backend/src/mdata/loads.routes.ts` (Dispatch board / Load list / Round trips / Truck
Planner — CC-1's lane per `docs/bus/LANES.md`'s explicit `apps/backend/src/mdata/loads.routes.ts`
line), `apps/backend/src/dispatch/planner.service.ts` (Timeline / Loads Planner — CC-1's
`apps/backend/src/dispatch/**`), and `apps/backend/src/reports/library.routes.ts` (Today's
Attention "In-flight loads running late" — not explicitly assigned to any seat in LANES.md, cross
cited here regardless for safety). No new GL math, no schema change, no scope beyond swapping a
hardcoded status-list predicate for the shared `liveLoadsOpenDispatchExistsSql()` helper
CC-1's own `live-loads-view.ts` already exports for exactly this purpose.

Live-measured before/after, all three surfaces, same USMCA entity, matching the ruling's own
proven 5/9 numbers:
  mdata/loads.routes.ts (board_scope=live, no tour legs):        19 -> 5
  dispatch/planner.service.ts (2-week window, current dates):    21 -> 5
  reports/library.routes.ts ("In-flight loads running late"):    19 -> 5 (the owner's own cited
    "AT RISK SHOWS 19" defect, at its literal source)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
