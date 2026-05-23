# CAP-13 Geofencing (Phase 5 Telematics)

## Piece 0 Investigation

- Address sources:
  - `mdata.locations` stores canonical geocoded locations (`latitude`/`longitude`) plus links to `mdata.customers` and `mdata.vendors`.
  - `mdata.customers` and `mdata.vendors` keep billing/address text, but geofence linking should prefer `mdata.locations` for spatial precision.
- CAP-1 GPS point availability:
  - This branch does not yet expose a standalone CAP-1 GPS history table.
  - GPS points are consumed from Samsara webhook payloads during projection (`webhook-projectors/vehicle-projector.ts`).
  - CAP-13 detection hooks into that projection path and emits `geo.geofence_events` transitions.
- Geofence storage decision:
  - PostGIS polygon geography is selected (`geography(POLYGON, 4326)`) rather than center-radius circles.
  - Rationale: customer yards/terminals are often irregular; polygon containment gives accurate detention/dwell boundaries.

## CAP-13 Data Model

- `geo.geofences`:
  - Tenant-scoped geofence definitions with polygon geography and soft reference (`location_ref_id`).
- `geo.geofence_events`:
  - Append-only entry/exit stream by geofence + unit (+ optional driver), storing the raw GPS point for audit.

## Runtime Flow

1. Samsara webhook vehicle projector upserts `integrations.samsara_vehicles`.
2. If payload includes a GPS point and the vehicle is linked to a local unit, detector checks active tenant geofences.
3. Detector compares current containment vs last known in/out state.
4. State changes are inserted append-only into `geo.geofence_events`.

## UI Surfaces

- `/dispatch/geofencing`:
  - Geofence configuration page with polygon input, location linking, active/inactive toggle.
- `/reports/geofence-dwell`:
  - Dwell report by geofence/unit/driver with date filters and CSV export.
