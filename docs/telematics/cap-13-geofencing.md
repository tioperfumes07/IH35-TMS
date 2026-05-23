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
  - PostGIS dependency was removed to keep migrations Neon-compatible by default (no extension enablement required).
  - Geofence polygons are stored as `vertices_json` (`[{ lat, lng }, ...]`) in plain Postgres.
  - Runtime containment uses a TypeScript ray-casting point-in-polygon check.
  - Scale assumption: per-tenant geofence count is low enough for in-memory iteration on incoming GPS points.

## CAP-13 Data Model

- `geo.geofences`:
  - Tenant-scoped geofence definitions with polygon vertices in jsonb and soft reference (`location_ref_id`).
- `geo.geofence_events`:
  - Append-only entry/exit stream by geofence + unit (+ optional driver), storing raw latitude/longitude for audit.

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
