-- 202615030000_unit_stop_events.sql
-- ROUND 306 E-03 (owner order, 2026-10-01): "record the miles or odometer each time it stops for
-- more than three to five minutes ... linked to every single truck, to every single geofence,
-- triggering automatically."
--
-- Persists what telematics/stop-odometer-capture.service.ts computes. The engine was proven live
-- 2026-10-01 read-only (66 stops / 24 h on the live fleet, 49 with odometer, 31 with miles). This
-- table makes those rows durable so PM due, settlement miles and the integrity score read a stored
-- fact instead of recomputing 24 h of positions each time.
--
-- RULES CARRIED INTO THE SCHEMA, not left to the writer's good behaviour:
--   odometer_mi NULL is a legitimate, stated outcome (odometer_note says why) -- never a guess.
--   odometer_age_minutes records how stale an attached reading was; 0 = read inside the stop.
--   miles_since_previous_stop NULL when either end lacks an odometer; a NEGATIVE delta is refused
--   by the CHECK so a backwards odometer can never be stored as miles.
--   geofence_id is an ATTRIBUTE (nullable) -- a stop outside every fence is still a stop.
--   UNIQUE (unit_id, started_at) makes the cron idempotent: re-running a window updates, never dups.
--   America/Chicago is the business time zone; timestamps are timestamptz (UTC on disk).
-- Additive, idempotent (IF NOT EXISTS), no existing data touched.

CREATE TABLE IF NOT EXISTS telematics.unit_stop_events (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL,
  unit_id                     uuid NOT NULL REFERENCES mdata.units(id),
  started_at                  timestamptz NOT NULL,
  ended_at                    timestamptz NOT NULL,
  dwell_minutes               numeric(8,1) NOT NULL CHECK (dwell_minutes >= 3),
  sample_count                integer NOT NULL CHECK (sample_count >= 1),
  lat                         numeric(9,6),
  lng                         numeric(9,6),
  city                        text,
  state                       text,
  odometer_mi                 double precision,
  odometer_read_at            timestamptz,
  odometer_age_minutes        numeric(8,1),
  odometer_note               text NOT NULL,
  miles_since_previous_stop   numeric(10,1) CHECK (miles_since_previous_stop IS NULL OR miles_since_previous_stop >= 0),
  miles_note                  text NOT NULL,
  geofence_id                 uuid REFERENCES geo.geofences(id),
  geofence_label              text,
  geofence_kind               text,
  metres_from_fence_centre    numeric(10,1),
  driver_id_at_time           uuid REFERENCES mdata.drivers(id),
  load_id_at_time             uuid REFERENCES mdata.loads(id),
  source                      text NOT NULL DEFAULT 'stop_odometer_capture',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_stop_events_odometer_consistency CHECK (
    (odometer_mi IS NULL AND odometer_read_at IS NULL AND odometer_age_minutes IS NULL)
    OR (odometer_mi IS NOT NULL AND odometer_read_at IS NOT NULL AND odometer_age_minutes IS NOT NULL)
  ),
  CONSTRAINT unit_stop_events_unit_start_unique UNIQUE (unit_id, started_at)
);

CREATE INDEX IF NOT EXISTS unit_stop_events_oc_started_idx ON telematics.unit_stop_events (operating_company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS unit_stop_events_unit_started_idx ON telematics.unit_stop_events (unit_id, started_at DESC);
CREATE INDEX IF NOT EXISTS unit_stop_events_geofence_idx ON telematics.unit_stop_events (geofence_id) WHERE geofence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unit_stop_events_driver_idx ON telematics.unit_stop_events (driver_id_at_time) WHERE driver_id_at_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS unit_stop_events_load_idx ON telematics.unit_stop_events (load_id_at_time) WHERE load_id_at_time IS NOT NULL;

ALTER TABLE telematics.unit_stop_events ENABLE ROW LEVEL SECURITY;

-- RLS: identical shape to telematics.load_odometer_segments (202613761200). Idempotent via DROP IF EXISTS.
DROP POLICY IF EXISTS unit_stop_events_entity_select ON telematics.unit_stop_events;
CREATE POLICY unit_stop_events_entity_select ON telematics.unit_stop_events FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
DROP POLICY IF EXISTS unit_stop_events_entity_write ON telematics.unit_stop_events;
CREATE POLICY unit_stop_events_entity_write ON telematics.unit_stop_events FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
GRANT SELECT, INSERT, UPDATE ON telematics.unit_stop_events TO ih35_app;
-- No DELETE grant. A stop that turns out to be wrong is superseded by the re-run (UNIQUE unit_id,
-- started_at -> UPDATE), never removed.

COMMENT ON TABLE telematics.unit_stop_events IS
  'E-03 stop-odometer capture: every stop >= 3 min per unit. odometer_mi is READ or NULL, never interpolated; miles_since_previous_stop NULL unless both ends carry an odometer; geofence is an attribute, not the trigger. Idempotent on (unit_id, started_at).';
