# IH35-TMS — Dispatch Geofence Timing Model (WF-043)
**LOCKED — do not modify without Jorge's explicit approval**

## Stop State Machine
Every pickup/delivery stop follows this forward-only state machine:
`scheduled → en_route → arrived → checked_in → loading → loaded → departed`
Delivery variant: `...loaded → unloading → unloaded → departed`
- Backward transitions only via dispatcher correction (append-only event log)

## Timestamps per Stop
Captured: arrived_at, checked_in_at, loading_started_at, loaded_at (or unloading_started_at/unloaded_at for delivery), departed_at
Each timestamp tagged with source: `geofence` / `driver_PWA` / `dispatcher_manual`

## Truck-Move Detection (Geofence Dwell)
- Arrival: 60s continuous inside geofence (prevents drive-by false hits)
- Departure: 120s continuous outside geofence (prevents brief exit/re-entry false departure)
- Radii: 200m warehouse / 500m yard-port / 1000m border

## Derived Times
- **Dwell**: departed_at − arrived_at
- **Detention**: max(0, dwell − customer_free_time). Default free time = 120 min. Billable beyond free time; requires Manager/Owner approval per load before hitting invoice.
- **Layover**: dwell > 8h overnight, non-customer
- **Booking gap**: time a unit sits empty between loads (dispatcher analytics)
- **Late arrival**: arrived_at > scheduled_at + 30 min grace

## Source Priority
geofence auto > PWA tap > dispatcher manual (least trusted, audit-logged)
Earliest timestamp wins. >5 min mismatch between sources → logs a reconciliation event.

## Border Geofences (Laredo / World Trade / Pharr)
- Flag: is_border_crossing = true
- Radius: 1000m
- Captures: crossing_in_at, crossing_out_at for customs analytics + IFTA + border charge routing

## Load Detail Drawer — Full Tab Set (Blueprint 8a.0.2.2)
Required tabs: Overview · Stops · Driver Pay · Documents · Settlement · Geofence Timeline · Audit
- Currently live: Overview / Stops / Documents / Assignment History / Audit
- To add (additive): Driver Pay, Settlement, Geofence Timeline
- Stops tab: shows arrived/loading/loaded/departed + source badge per stop
- Geofence Timeline tab: dwell per stop with detention threshold line + layover band
- Drawer opens on both Kanban and List views; must be editable
