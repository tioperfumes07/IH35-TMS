# Using the dispatch board

Dispatch is the load command center: board/list/table views, assignment, and queues for risk (detention, border, late). Open **Dispatch** from the left rail.

## Overview
- Work views include board-style commitments, list/table detail, assignment queues, and planners (driver/truck/loads) as shipped in the module tabs.
- Open a load to use the load detail drawer (`?load_id=`). Related tabs cover factoring packet context, customs, and settlement profitability where wired.
- Filters cover equipment, region, risk flags, and status. Prefer explicit **Assign** actions over ambiguous gestures on small screens.

## Key tasks
- **Book or create a load** with **+ Book** / **+ Create** from the module header when available.
- **Assign a driver and unit** from the load drawer; respect HOS and maintenance advisories when the system warns.
- **Monitor queues** (at-risk, detention, border, late) so exceptions do not sit only on the main board.
- **Keep customer credit in view** before booking — credit limit source may be factor, manual, or future RMIS.

## Tips & gotchas
- Legacy URLs like `/dispatch/loads` redirect into the modern Dispatch query views.
- Operating company must match the customer and units you intend to use.
- Dispatch links outward to Settlements, Factoring, Safety, and Maintenance — use EntityLinks rather than copying UUIDs.
