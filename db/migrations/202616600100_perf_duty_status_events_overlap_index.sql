-- ROW 124+138 (LEAD ROUND 8.24): duty CTE in driver-day-summary scanned 15,550 index rows for 52
-- results (2026-11-12, prod, bypass, 1,465ms execution time). Root cause: existing dedupe index
-- (opco, driver_id, duty_status, started_at, source) is chosen for `duty_status IN (...) AND
-- started_at < day_end` — that bound matches ALL historical events for the opco.
--
-- Fix: index on (opco, duty_status, ended_at) for ended events.
--   For the overlap condition COALESCE(ended_at, day_end) > day_start:
--     • this index covers `ended_at > day_start` → hits only recent events (~52 rows)
--     • the existing idx_hos_duty_status_events_open covers `ended_at IS NULL`
--   The planner combines them via BitmapOr, reducing from 15,550 → ~52 rows scanned.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_hos_duty_status_events_duty_ended
  ON hos.duty_status_events (operating_company_id, duty_status, ended_at)
  WHERE ended_at IS NOT NULL;

COMMIT;
