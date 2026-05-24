# CAP-AGGREGATE Driver Day Summary

- Adds `GET /api/v1/telematics/driver-day-summary?operating_company_id=<uuid>&date=YYYY-MM-DD`.
- Tenant-scoped, read-only aggregate over:
  - `telematics.vehicle_locations` (mileage from consecutive points),
  - `hos.duty_status_events` (on-duty + driving overlap hours),
  - `fuel.fuel_transactions` (fuel stop count),
  - `dispatch.stop_arrivals` + `mdata.load_stops` (on-time vs late).
- Home page includes a `Driver day-summaries` card with date picker and sortable metrics.
