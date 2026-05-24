# CAP-1 Real-time GPS Tracking Foundation

## Scope

- Adds append-only `telematics.vehicle_locations` for normalized GPS history.
- Adds `telematics.vehicle_latest_position` view for latest-by-unit lookups.
- Adds read-only APIs:
  - `GET /api/v1/telematics/positions/latest`
  - `GET /api/v1/telematics/positions/:unit_id/history`
- Extends Samsara vehicle projector to persist GPS points on location events.
- Dispatch UI now polls latest positions every 30 seconds for map-feed consumers.

## Guardrails

- `scripts/verify-vehicle-locations-tenant-scope.mjs`
- `scripts/verify-vehicle-locations-append-only.mjs`
- `scripts/verify-position-endpoints-no-pii-leak.mjs`
