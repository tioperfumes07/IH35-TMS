-- GAP-64 / CAP-14: Reefer cargo temp/humidity sensor readings.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.cargo_sensor_readings (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  load_uuid uuid NULL REFERENCES mdata.loads(id) ON DELETE SET NULL,
  trailer_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE RESTRICT,
  sensor_id text NOT NULL,
  temp_celsius numeric(6, 2) NULL,
  humidity_pct numeric(5, 2) NULL,
  door_status text NOT NULL DEFAULT 'unknown' CHECK (door_status IN ('open', 'closed', 'unknown')),
  reading_at timestamptz NOT NULL,
  out_of_range boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cargo_sensor_readings_company_sensor_at
  ON dispatch.cargo_sensor_readings (operating_company_id, sensor_id, reading_at);

CREATE INDEX IF NOT EXISTS idx_cargo_sensor_readings_load_at
  ON dispatch.cargo_sensor_readings (operating_company_id, load_uuid, reading_at DESC);

CREATE INDEX IF NOT EXISTS idx_cargo_sensor_readings_trailer_at
  ON dispatch.cargo_sensor_readings (operating_company_id, trailer_uuid, reading_at DESC);

CREATE INDEX IF NOT EXISTS idx_cargo_sensor_readings_out_of_range
  ON dispatch.cargo_sensor_readings (operating_company_id, reading_at DESC)
  WHERE out_of_range = true;

ALTER TABLE dispatch.cargo_sensor_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cargo_sensor_readings_company_scope ON dispatch.cargo_sensor_readings;
CREATE POLICY cargo_sensor_readings_company_scope
  ON dispatch.cargo_sensor_readings
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.cargo_sensor_readings TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dispatch TO ih35_app;

COMMIT;
