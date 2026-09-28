# LANE-CROSS ruling — CC-1 touching driver_finance.driver_settlements / settlement_lines

**Date:** 2026-09-28
**Seat:** CC-1
**Authority:** Lead order, ROUND 148 (Updated) — "DRIVER MAP FIRST, THEN A/P" (09-28-2026 1:30 AM CT),
directing CC-1 by name to execute the full driver de-duplication merge, including "repoint all
Samsara mapping rows" and full FK correctness across every table referencing a merged driver.

## Why this crosses a lane

`docs/bus/LANES.md` assigns `driver_finance.driver_settlements` and `driver_finance.settlement_lines`
to CC-3. The driver-merge tool (`scripts/ops/2026-09-28-cc1-round148-merge-driver-v5.ts`) repoints
`driver_id` (and `settlement_lines.split_partner_driver_id`) from a retired duplicate driver profile
to its survivor across every FK table in the schema — including these two — because a merge that
leaves any table still pointing at the retired (soon status=Inactive) driver id is an incomplete
merge, exactly the "loser reference check" the tool enforces (`remainingRefs > 0` throws).

`mdata.drivers` itself, and `driver_finance.driver_bills`, are already CC-1's own per LANES.md line
23 — only the two `driver_finance.*` tables above are outside CC-1's assigned lane.

## Scope of the cross

Limited to: `UPDATE driver_finance.driver_settlements SET driver_id = <survivor> WHERE driver_id =
<loser>` and `UPDATE driver_finance.settlement_lines SET split_partner_driver_id = <survivor> WHERE
split_partner_driver_id = <loser>`, for the 7 named duplicate-driver pairs in ROUND 148 only. No
settlement math, no new settlement rows, no change to any column other than the driver pointer.

## Ruling

Authorized. Cite this file's path under `LANE-CROSS:` in the PR body.
