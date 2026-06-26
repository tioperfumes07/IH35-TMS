# GAP-29: Booking-Gap Time per Dispatcher Analytics

## Purpose

Measures the time between load delivery and next truck (unit) assignment per dispatcher.
Identifies dispatchers who maximize asset utilization by re-booking trucks quickly.

## Tables Used (No New Tables)

Analytics over existing data:

| Table | Usage |
|---|---|
| `mdata.loads` | Delivered loads, `booked_by_user_id` for dispatcher attribution |
| `mdata.load_stops` | Delivery stop `actual_departure_at` as delivery timestamp |
| `dispatch.load_assignment_history` | `new_unit_id` + `assigned_at` for next assignment |
| `identity.users` | Dispatcher name/email labels |

## Dispatcher Attribution

Uses `mdata.loads.booked_by_user_id` (FK → `identity.users.id`).

## Filtering

- Gaps > 24h excluded (weekends, planned downtime)
- Only loads with `status IN ('delivered', 'delivered_pending_docs')`
- Only gaps > 0h (same-day re-assignments only count if unit changed loads)

## API Endpoints

```
GET /api/v1/dispatch/analytics/booking-gap
  ?operating_company_id=<uuid>
  &from=YYYY-MM-DD
  &to=YYYY-MM-DD

GET /api/v1/dispatch/analytics/booking-gap/dispatcher/:dispatcherId
  ?operating_company_id=<uuid>
  &from=YYYY-MM-DD
  &to=YYYY-MM-DD
```

## Response Shape

```json
{
  "data": {
    "from": "2026-05-31",
    "to": "2026-06-07",
    "dispatchers": [
      {
        "dispatcher_id": "uuid",
        "dispatcher_label": "Jane Doe",
        "loads_counted": 24,
        "avg_gap_hours": 2.3,
        "p50_gap_hours": 1.8,
        "p90_gap_hours": 5.1,
        "rank": 1
      }
    ]
  }
}
```

## Workers

- `booking-gap-aggregator-worker` — runs every 6h, pre-warms analytics for all active companies
- Controlled by `BOOKING_GAP_AGGREGATOR_INTERVAL_MS` env var (default: 21600000)

## Frontend

- `/reports/booking-gap` — leaderboard table with period filter (week/month/quarter)
  - Best dispatcher highlighted green (rank #1), worst in amber (no red/public shaming)
- `DispatcherPerformanceCard.tsx` — per-dispatcher card showing avg/p50/rank (last 30 days)

## Metrics Computed

| Metric | Description |
|---|---|
| `avg_gap_hours` | Mean gap across all filtered assignments |
| `p50_gap_hours` | Median gap (50th percentile) |
| `p90_gap_hours` | 90th percentile gap |
| `rank` | Ascending by avg_gap_hours (rank 1 = most efficient) |

## Non-Goals

- No automated punitive action based on ranking
- No financial data (no rates, invoices, or amounts)
- No new database tables or migrations required
- RLS is enforced via `operating_company_id` scoping

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/frontend/src/pages/reports/BookingGapReport.tsx
