AGENT-1 · Block 5 of 13 — PHASE Dispatch / TASK <add tracker row DISP-LIST-TABLE-ASSIGN> — List(simple+risk) vs Table(detailed) + unassigned-on-top
SO: prepend BOX 0.
SCOPE (ADDITIVE): List = simple cols (Load/Customer/Unit/Driver/Lane/Delivery/RISK/Status) with at-risk-of-late flag; unassigned (no unit) sorted on top. Table = detailed (add WO#, Commodity, Lane, Linehaul, Flag). Assignment = reorder so UNASSIGNED UNITS are the TOP band (cover first), then Booked loads (reserve-a-load: bookable with no unit/driver) with Doc-Compliance column, then Assigned units. Consistent core columns across list-type views.
FILES: DispatchBoard.tsx (EDIT) + list/table/assignment components. Risk from blended ETA tier.
ACCEPTANCE: List shows risk; Table is the detailed superset; unassigned units top of Assignment; reserve-a-load supported.
LANE LOCK: DispatchBoard.tsx single writer.
