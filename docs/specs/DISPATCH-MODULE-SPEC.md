# IH35-TMS — Dispatch Module Spec (consolidated)
LOCKED 2026-06-08 | supersedes scattered dispatch notes; additive to existing dispatch code

## Views (segmented toggle + top-bar)
- Overview (command center, default) — KPIs + 6 clickable panels (Unassigned units, Round-trip exposure, At-Risk, Detention, Border, Out-of-service); every row shows unit + driver + load.
- Load Board = Kanban with TRUE states: Pending → Assigned → En Route → At Pickup → Loaded → At Delivery → Delivered (Samsara + driver PWA + dispatcher + geofence drive transitions). Completed/Cancelled terminal.
- List = SIMPLE (Load/Customer/Unit/Driver/Lane/Delivery/Risk/Status) incl. at-risk-of-late flag.
- Table = DETAILED (all columns incl WO#/Commodity/Lane/Linehaul/Flag).
- Assignment = stacked: UNASSIGNED UNITS ON TOP (need coverage) → Booked loads (reserved, no unit/driver; reserve-a-load allowed) → Assigned units. Booked carries Doc-Compliance column (gate).
- Round Trips (renamed from "Units") = Kanban-style: each unit card + its return-trip card beside it (or dashed "Needs return"); shows roundtrip coverage at a glance.
- Queues (top-bar, with counts): At-Risk, Detention, Border Crossings, Late Arrivals, Live Map.
- Planners: Driver Planner + Truck Planner (mirror Safety Driver Scheduler grid, range 7/14/30/40) + Loads Planner (Gantt, multi-day spans). All share one date range/timeline.
- Settlements: Pre-settlements (NB→SB trip-linked), Settlements & pay, Trip Profitability.
- Factoring: queue + FARO Reserve Tracker.

## Global
- OUT-OF-SERVICE / in-shop units pinned to the BOTTOM of EVERY view (full-fleet visibility).
- Breadcrumb page-title on top: "Dispatch › <current view>".
- Six-column sizing standard; denser boxes (smaller padding/fonts) to fit more on full screen.
- Sortable column headers everywhere (Global Sort Rule).
- ETA = blended (Samsara GPS/speed/route + traffic ETA + driver PWA + geofence + dispatcher + incidents + HOS) → On time / Behind / Late + Conf.% — per DISPATCH-GEOFENCE-TIMING-MODEL.md.

## Load Detail Drawer (existing LoadDetailDrawer.tsx — EXTEND, additive)
Opens from EVERY surface via ?load_id=. canEdit honored. Tabs (additive): Overview, Stops, Documents, Driver Pay, Settlement (+instant profitability), Factoring (NEW), Customs (NEW, cross-border only), Geofence Timeline, Assignment History, Audit, Pre-Settlement (+Add SB Load).

## Cited existing specs (do not rebuild)
FACTORING-PACKET-AUTO-ASSEMBLY.md, CROSS-BORDER-DISPATCH.md, LOAD-PROFITABILITY-AT-DELIVERY.md, CASHFLOW-BLUEPRINT-ADDITION.md, DISPATCH-GEOFENCE-TIMING-MODEL.md, gap-14-validation-pre-dispatch.md, gap-26-border-crossings.md, NAVIGATION-PATTERN-RULE.md, GLOBAL-SORT-RULE.md.
