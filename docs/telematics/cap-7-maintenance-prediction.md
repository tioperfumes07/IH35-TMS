# CAP-7 Maintenance Prediction From Odometer

## Design

- CAP-7 introduces `maintenance.pm_alerts` as an append-only PM alert log.
- Predictor runs from Samsara vehicle webhook projection when odometer mileage is present.
- For each active PM schedule on the unit:
  - resolve `next_due_odometer`,
  - if `current_odometer + lookahead_miles >= next_due_odometer`, open a PM alert,
  - skip when an existing open alert already exists for the same schedule.

## Threshold + Lookahead

- Default lookahead is `500` miles.
- Override supported via `SAMSARA_PM_LOOKAHEAD_MILES` environment variable.
- Uses read-only schedule lookup + idempotent insert with open-alert dedupe.

## UI integration

- Maintenance Home now surfaces `MaintenanceAlertsCard`.
- Card lists open PM alerts and supports:
  - acknowledge,
  - link alert to an existing work order as scheduled.
