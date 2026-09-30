# CC-1 — ROUND 303 (money paused; maintenance + dispatch engines only)

Read 09-30-2026-ALL-SEATS-OWNER-SCOPE-CHANGE-MONEY-STOPS.md first.
A-35 escrow GL, A-36 factoring reserve, A-37 A/P gap, A-38 the 931 routing: ALL PAUSED.
Your five unapplied migrations: leave them. Do not ask again, do not attempt db:migrate.

## A-40 — wo_type "tire" ROUTED BY source_type (top item, maintenance logic, NOT money)
docs/bus/2026-09-30-LEAD-RULING-WO-TYPE-TIRE-IS-SPLIT-BY-SOURCE-TYPE.md
verify-transaction-linkage-law has been printing a [WARN] asking the Lead for this ruling. It is
answered. Act on it.
    source_type RS / roadside  -> TIER 1, unit AND driver AND load
    source_type IS / in_house  -> TIER 2, UNIT ONLY, load and settlement NEVER forced
Remove "tire" from the forced-load_id set in work-orders.routes.ts. The guard must FAIL if a
Tier 2 tire row is DEMANDED to carry a load.
Forcing load_id on a yard tire change is the defect: a writer compelled to supply one invents it,
and an invented load link looks correct forever.

## A-41 — THE WORK ORDER WIZARD (owner has raised it more than once)
Owner, verbatim: "I TOLD YOU ABOUT THE ISSUES WITH THE WORK ORDER WIZARD, MANY MORE."
Audit the wizard end to end and report before changing: every required field, whether each is
genuinely required, what it writes, and every field that is required but should not be. A
required-field asterisk that lies is the UI form of A-40's defect. Report, then fix.

## A-42 — WORK ORDER LINKAGE, BOTH DIRECTIONS
Per the law, section 6: a link that resolves one way and not the other is HALF A LINK and counts
as unlinked. For maintenance.work_orders prove BOTH: unit -> its work orders, and work order ->
its unit, driver, and where Tier 1, its load. Same for road_service_tickets. Name what does not
resolve in reverse rather than forcing it.

## A-43 — WORK ORDER COLUMNS the owner named, served from the backend
Owner, verbatim: "all work orders must show and views report date, date in shop, and expected
release." Those three fields must exist, be populated where known, and render "—" where not.
If any of the three does not exist as a column today, say so plainly -- do not derive it.

## A-44 — re-read this file.

LANE: no apps/frontend (Cursor owns screens). NO money paths at all this round.
