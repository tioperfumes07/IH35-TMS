# GAP-30 — Late-Arrival Rate Analytics

**Block:** GAP-30 · **Phase:** GAP-MEDIUM · **Wave:** G-N Lane A

## Purpose

Historical late-arrival rate analytics grouped by driver, customer, and lane. Complements real-time late-arrival alerts (B21-D6) with completed-stop KPIs for safety and customer ops.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/dispatch/analytics/late-arrivals?operating_company_id=&from=&to=&by=driver\|customer\|lane` | Aggregated ranking |
| GET | `/api/v1/dispatch/analytics/late-arrivals/driver/:uuid?operating_company_id=&from=&to=` | Per-driver detail |
| GET | `/api/v1/dispatch/analytics/late-arrivals/customer/:uuid?operating_company_id=&from=&to=` | Per-customer detail |

## Logic

- **Late** = `arrived_at > scheduled_at + grace` where grace defaults to 30 minutes (`DISPATCH_LATE_ARRIVAL_GRACE_MINUTES`).
- **Arrived** = `COALESCE(stop_arrivals.confirmed_at, stop_arrivals.triggered_at)`.
- **Scheduled** = `COALESCE(appointment_end_at, scheduled_arrival_at, appointment_start_at)`.
- **Chronic offender** = late rate &gt; 20%.

## UI

- Report: `/reports/late-arrival` — tabs by driver / customer / lane.
- Cards: `DriverLateArrivalCard`, `CustomerLateArrivalCard` (standalone components for detail pages).

## Worker

`late-arrival-aggregator-worker.ts` runs every 6 hours, pre-warming aggregates per active operating company.

## CI

`verify:late-arrival-analytics` — routes, worker, report page, manifest route, docs.

## Related

- B21-D6 late-arrival **alerts** (real-time ETA)
- GAP-69 Driver Manager home (`late_arrivals_7d` KPI)
- GAP-71 / GAP-72 downstream consumers

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx
