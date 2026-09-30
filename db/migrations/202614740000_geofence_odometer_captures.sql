-- T-21 (owner order, 2026-09-30): "record each vehicle's mileage automatically in every
-- Loves geofence, in DOTs, and for every pickup and delivery, every time we leave the yards."
--
-- One row per geo.geofence_events row (UNIQUE on geofence_event_id -- idempotent, replaying the
-- feed can never double-write), capturing the unit's odometer at that moment with an HONEST
-- source: a real OBD reading, an interpolation between two real readings, or absent. Never a
-- derived mileage that cannot say where it came from (mpg_method on driver_finance.company_
-- settlements already follows this exact pattern; this table matches it deliberately).
BEGIN;

CREATE TABLE IF NOT EXISTS telematics.geofence_odometer_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  geofence_event_id uuid NOT NULL UNIQUE REFERENCES geo.geofence_events(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  geofence_id uuid NOT NULL REFERENCES geo.geofences(id),
  geofence_kind text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('entered', 'exited')),
  occurred_at timestamptz NOT NULL,
  odometer_mi double precision,
  odometer_source text NOT NULL CHECK (odometer_source IN ('real_obd', 'interpolated', 'absent')),
  odometer_reading_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_odo_unit_time
  ON telematics.geofence_odometer_captures (unit_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_geo_odo_kind
  ON telematics.geofence_odometer_captures (geofence_kind, occurred_at DESC);

ALTER TABLE telematics.geofence_odometer_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_geo_odo_company ON telematics.geofence_odometer_captures;
CREATE POLICY rls_geo_odo_company
  ON telematics.geofence_odometer_captures
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON telematics.geofence_odometer_captures TO ih35_app;

COMMIT;
