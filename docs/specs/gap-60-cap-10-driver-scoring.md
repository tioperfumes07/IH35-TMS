# GAP-60 — CAP-10 Driver Scoring Page (Safety Module)

## Summary

Composite driver safety scoring with a fleet leaderboard and per-driver trend chart in the Safety module. Aggregates `safety.harsh_events` with telematics pairing (`telematics.vehicle_driver_assignments`) and GPS mileage to produce weekly `safety.driver_safety_scores` rows.

## Schema

Migration: `db/migrations/202606080218_driver_safety_scores.sql`

| Column | Type | Notes |
|--------|------|-------|
| uuid | UUID PK | |
| operating_company_id | UUID | tenant scope |
| driver_uuid | UUID | FK `mdata.drivers` |
| period_start / period_end | DATE | inclusive scoring window |
| harsh_brake_count | INTEGER | from harsh_events |
| hard_accel_count | INTEGER | from harsh_events |
| speeding_seconds | INTEGER | speeding events × 60s |
| lane_departure_count | INTEGER | harsh_turn proxy until lane event kind ships |
| miles_driven | NUMERIC(10,2) | telematics GPS + pairing |
| composite_score | NUMERIC(5,2) | 0–100, higher is safer |
| rank_in_fleet | INTEGER | within period + tenant |
| computed_at | TIMESTAMPTZ | |

Unique: `(driver_uuid, period_start, period_end)`. RLS tenant policy on `operating_company_id`.

## Composite formula

File: `apps/backend/src/safety/driver-scoring/composite-score.ts`

- Weights: harsh brake **30%**, hard accel **25%**, speeding **25%**, lane departure **20%**
- Minimum **500 miles** in period to receive a score (anti-gaming)
- Sub-scores normalized 0–100; weighted sum rounded to 2 decimals

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/safety/driver-scoring/period?operating_company_id=&from=&to=` | Fleet leaderboard for date range |
| GET | `/api/safety/driver-scoring/driver/:uuid?operating_company_id=&periods=12` | Per-driver trend (latest N periods) |

Legacy live-scoring routes remain at `/api/v1/safety/driver-scoring` (harsh-event severity formula, no DB writes).

## Worker

`apps/backend/src/jobs/driver-scoring-aggregator-worker.ts`

- Cron: **Monday 03:00 America/Chicago**
- Aggregates prior calendar week (Mon–Sun)
- Upserts scores and recomputes `rank_in_fleet` per tenant

Disable with `ENABLE_DRIVER_SCORING_AGGREGATOR_WORKER=false`.

## Frontend

- `apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx` — leaderboard with week/month/quarter filters
- `apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx` — 12-period sparkline + breakdown table
- Route: `/safety/driver-scoring` (tab already in `SAFETY_TABS_CONFIG`)

## Verification

```bash
npm run verify:cap-10-driver-scoring
```

Checks migration, composite weights, routes, worker registration, UI wiring, and CI gate.

## Related

- `safety.harsh_events` — migration `0231_cap10_driver_scoring_harsh_events.sql`
- CAP-9 pairing — `telematics.vehicle_driver_assignments`
- Consumer: GAP-69 Driver Manager home leaderboard (legacy formula until scores backfill)
