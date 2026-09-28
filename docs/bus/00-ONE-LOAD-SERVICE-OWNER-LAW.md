# ONE LOAD SERVICE — OWNER LAW, 2026-09-28
Owner ruling, verbatim: "ALL LOAD BOARD VIEWS ARE ONE SERVICE AND THE LOAD COSTS RENDERS THE COSTS
FROM THOSE SAME SERVICES." Overrides every surface-local query and any earlier per-page convention.

## THE LAW
**There is ONE canonical load service. Every load board view reads it. Load costs reads its costs from
that same service.** No surface runs its own load query. No page computes its own cost. A screen that
disagrees with another screen is a bug in the caller, never a reason to add a fourth query.

Surfaces bound by this: Open Loads · Delivered/Completed · Unsettled · Planner · Trailers · Loads
Timeline · Information Grid · the truck-line board · Load Costs · Pre-Settlements · Load Detail.

## WHY THIS IS LAW AND NOT A PREFERENCE
Measured 2026-09-28: `verify-one-canonical-active-load-set` is RED on main, with fresh rot in
`load-settlement-summary.routes.ts`, and `verify-dispatch-reads-live-loads-view` went 2 -> 3 violations
in `load-profitability.service.ts`. Both are surfaces running their own query instead of the canonical
one. That is exactly why the boards, load costs and pre-settlements show different numbers for the same
load, and why the owner cannot trust any board.

## HOW TO COMPLY
1. `views.live_loads` is the canonical active-load set. The load service is its only reader.
2. Every board view calls the load service. Filters (status, date range, settled/unsettled, booked/
   available) are ARGUMENTS to that service — never separate queries.
3. Load Costs renders the cost fields the same service returns. It does not join its own expenses,
   driver bills, fuel or settlement lines.
4. Pre-settlements read the same service. A closed load on an OPEN settlement STAYS in pre-settlement
   (owner ruling, standing).
5. The two guards above are the enforcement point. Fix the CALLER, never the guard, never the baseline.

## DONE MEANS
The same load, opened on the loadboard, on Load Costs and in pre-settlements, shows identical status,
driver, unit, trailer, rate, revenue and cost — screenshots side by side, plus both guards green.
