# GAP-64 — CAP-14 Cargo Temp/Humidity Sensors

**Block:** GAP-64 · **Capability:** CAP-14 (Samsara Reefer Sensors) · **Wave:** P2-G

## Problem

Reefer and temperature-controlled loads can drift out of required cargo temperature or humidity during transit. Without a tenant-scoped telemetry timeline and fast out-of-range visibility, dispatch and safety teams react late and claims exposure increases.

## Solution

Add an additive cargo sensor telemetry surface with:

- `dispatch.cargo_sensor_readings` storage (append/upsert by sensor timestamp)
- threshold evaluation service for temp/humidity range checks
- 5-minute ingestion worker for active reefer loads
- dispatch API routes for timeline + out-of-range views
- dispatch board cargo temperature badge for reefer freight rows

## Data model

### `dispatch.cargo_sensor_readings`

- Tenant key: `operating_company_id uuid` (FK `org.companies`)
- Sensor keys: `sensor_id`, `reading_at`
- Scope links: `load_uuid`, `trailer_uuid`
- Payload: `temp_celsius`, `humidity_pct`, `door_status`
- Risk signal: `out_of_range`

RLS policy enforces tenant scope with:

- `operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid`
- lucia bypass allowance for system workers

Grants are restricted to `ih35_app`:

- `GRANT USAGE ON SCHEMA dispatch TO ih35_app`
- `GRANT SELECT, INSERT, UPDATE ON dispatch.cargo_sensor_readings TO ih35_app`

## Threshold semantics

- Explicit required range wins when available (`required_temp_min/max`, optional humidity bounds)
- Fallback uses reefer setpoint (`temp_fahrenheit`) with a narrow operating band
- Default fallback range keeps ingest deterministic when booking metadata is sparse
- Severity escalates to **critical** when out-of-range duration exceeds **10 minutes**

## API routes

Base: `/api/v1/dispatch/cargo-sensors`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/load/:load_uuid/timeline?operating_company_id=&limit=` | Per-load reefer telemetry timeline with threshold status |
| `GET` | `/out-of-range?operating_company_id=&from=&to=&limit=` | Cross-load out-of-range readings for dispatch triage |

## Worker

`cap-14-cargo-sensor-worker.ts`

- Schedule: every 5 minutes (`*/5 * * * *`, `America/Chicago`)
- Scope: active companies + active reefer loads
- Action: ingest readings, evaluate thresholds, persist upserts
- Feature flag: disable with `ENABLE_CAP14_CARGO_SENSOR_WORKER=false`

## Frontend

- `CargoTempBadge` on dispatch board rows
  - `green`: in range
  - `amber`: near threshold edge
  - `red`: out of range
- `CargoSensorTimeline` page component for per-load historical trend rendering

## CI Guard

`scripts/verify-cap-14-cargo-sensors.mjs` checks migration, backend wiring, worker schedule, frontend badge/timeline, and block manifest/CI hooks.
# GAP-64 — CAP-14 Cargo Temp/Humidity Sensor Integration

## Scope

Continuous reefer cargo monitoring via Samsara CAP-14 telemetry:

- `dispatch.cargo_sensor_readings` stores temp/humidity/door status per trailer
- 5-minute worker ingests active reefer loads and flags out-of-range readings
- Threshold service notifies dispatchers (critical if >10 min out of range)
- Dispatch board badge + per-load timeline chart for FSMA/USDA compliance evidence

## API

- `GET /api/v1/dispatch/cargo-sensors/load/:load_uuid/timeline`
- `GET /api/v1/dispatch/cargo-sensors/out-of-range?from=&to=`

## CI

`npm run verify:cap-14-cargo-sensors`
