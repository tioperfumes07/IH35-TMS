# UNIFIED_BLUEPRINT_ADDITIONS.md — append (board/assignment view logic)

## 2026-06-07 — DISPATCH BOARD VIEW LOGIC locked

STATUS: locked by Jorge 2026-06-07. ADDITIVE. CORRECTS a prior error (there is NO Northbound/Southbound board section).

### Views
- Kanban and List are the SAME content in two formats. List view MUST render the same grouping/logic as Kanban,
  just as a list. (Units = the third view toggle, with the with-load / without-load split.)
- The six Kanban status columns are the canonical set + the universal sizing reference (see 04 Global UI rules):
  Pending Assignment · Assigned · In Transit · Delivered · Completed · Cancelled.

### Assignment view — stacked sections (top to bottom)
1. BOOKED LOADS — loads booked/accepted but NOT yet assigned to a unit or driver (reserved; see Reserve below).
2. ASSIGNED UNITS — units that HAVE a load assigned.
3. UNASSIGNED UNITS — units WITHOUT a load assigned (idle / available).
(This is the grouping for the board section in BOTH Kanban and List. It is NOT NB/SB.)

### Reserve-a-load (scheduling ahead)
- The system MUST allow creating/accepting a load with NO unit and NO driver assigned (e.g. a client offers a load
  2 weeks out; we accept it as part of scheduling but cannot assign yet).
- Reserved/booked loads appear in the BOOKED LOADS section/list until assigned, then move to ASSIGNED.
- Reserving a load must NOT require a unit/driver; assignment happens later.

### Column order (GLOBAL — see 04)
Always Unit → Trailer → Load # → ... (corrects the old prototype's Load#-first order; Jorge confirmed Unit first).

### Acceptance
1. List view mirrors Kanban logic in list form.
2. Assignment view shows Booked loads → Assigned units → Unassigned units.
3. A load can be reserved with no unit/driver and appears in Booked until assigned.
4. Column order Unit, Trailer, Load# everywhere.
