# CAP-6 HOS Fuel Stop Calculation

## Goal

Provide HOS-aware stop recommendations in fuel planner by combining:

- current HOS clocks (CAP-HOS-FOUNDATION),
- current tank and MPG estimate,
- route stop sequence.

## Decision Tree

- Compute `remaining_drive_miles` from HOS `drive_remaining_min`.
- Compute `remaining_fuel_miles = current_fuel_gallons * mpg`.
- For each route stop (ordered):
  - if fuel range at that stop is below `safety_threshold_miles` (default 50), recommend `low_fuel`.
  - else if HOS drive range is exhausted before that stop, recommend `ten_hour_reset_window`.

## Defaults

- `avg_speed_mph`: 60
- `default_mpg`: 6.5
- `safety_threshold_miles`: 50

## Guardrails

- `scripts/verify-fuel-stop-planner-no-db-writes.mjs`
- `scripts/verify-fuel-stop-planner-uses-cap-hos.mjs`
