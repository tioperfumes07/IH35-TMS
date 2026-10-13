-- 202615460900_load_stop_stamp_from_tracking.sql
-- CC-3 · ROUND 443.16 (owner 2026-10-10 4:53 PM CT: "we also already have the tracking data, geofences, locations").
--
-- MEASURED: the Settlement Creator wrote <delivery date>T18:00:00Z into actual_arrival_at AND actual_departure_at of the
-- delivery stop only — an invented time. telematics.unit_stop_events holds the trucks' real stops (started_at,
-- ended_at, odometer, geofence). A load stop had no way to say WHICH stop event stamped it, nor that a stamp is only a
-- document date (actual_arrival_source allows driver_app / eld_geofence / manual — none means "date only").
--
--   actual_stop_event_id   -> telematics.unit_stop_events(id): the tracked stop that stamped this load stop (the
--                             event carries the odometer, geofence and load_id_at_time). The GPS row is never edited.
--   actual_stamp_precision -> 'tracked' (times are the stop event's started_at / ended_at) or 'date_only' (no stop
--                             event matched: the document date, never presented as a measured time).
-- Additive, idempotent, writes no rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS actual_stop_event_id uuid;
ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS actual_stamp_precision text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_actual_stop_event_id_fkey') THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_actual_stop_event_id_fkey FOREIGN KEY (actual_stop_event_id) REFERENCES telematics.unit_stop_events(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_actual_stamp_precision_check') THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_actual_stamp_precision_check CHECK (
        actual_stamp_precision IS NULL
        OR (actual_stamp_precision = 'tracked' AND actual_stop_event_id IS NOT NULL)
        OR (actual_stamp_precision = 'date_only' AND actual_stop_event_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_load_stops_actual_stop_event_id ON mdata.load_stops (actual_stop_event_id) WHERE actual_stop_event_id IS NOT NULL;
COMMENT ON COLUMN mdata.load_stops.actual_stop_event_id IS 'ROUND 443.16: the telematics.unit_stop_events row whose started_at/ended_at stamped this stop (tracked).';
COMMENT ON COLUMN mdata.load_stops.actual_stamp_precision IS 'ROUND 443.16: tracked (measured from the stop event) or date_only (document date; no stop event matched).';

COMMIT;
