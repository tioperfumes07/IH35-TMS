-- 202615150900_detention_events_geofence_event_id.sql
-- E-09 (Lead decision 2026-10-01): dispatch.stop_arrivals is retired as a second arrival path; arrivals are the
-- canonical fence events (geo.geofence_events, 'entered' on a load-stop fence labelled load-<id>-stop-<n>).
-- dispatch.detention_events referenced the retiring table (stop_arrival_id -> dispatch.stop_arrivals, 0 rows on
-- both sides, measured 2026-10-01). Adds geofence_event_id -> geo.geofence_events so new detention rows link to
-- the arrival that started them; stop_arrival_id stays (nullable, history). Additive only.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE dispatch.detention_events
  ADD COLUMN IF NOT EXISTS geofence_event_id uuid NULL REFERENCES geo.geofence_events(id);

CREATE INDEX IF NOT EXISTS detention_events_geofence_event_id_idx
  ON dispatch.detention_events (geofence_event_id);

COMMENT ON COLUMN dispatch.detention_events.geofence_event_id IS
  'E-09: the geo.geofence_events ''entered'' row (load-stop fence) that started this detention. Replaces stop_arrival_id.';

COMMIT;
