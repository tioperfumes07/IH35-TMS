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
