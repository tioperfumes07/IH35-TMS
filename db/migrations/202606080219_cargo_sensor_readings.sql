-- GAP-64 / CAP-14: Reefer cargo temp/humidity sensor readings.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.cargo_sensor_readings (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  load_uuid UUID REFERENCES mdata.loads(id) ON DELETE SET NULL,
  trailer_uuid UUID NOT NULL,
  sensor_id TEXT NOT NULL,
  temp_celsius NUMERIC(6, 2),
  humidity_pct NUMERIC(5, 2),
  door_status TEXT CHECK (door_status IN ('open', 'closed', 'unknown')),
  reading_at TIMESTAMPTZ NOT NULL,
  out_of_range BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargo_sensor_load
  ON dispatch.cargo_sensor_readings (load_uuid, reading_at DESC);

CREATE INDEX IF NOT EXISTS idx_cargo_sensor_out_of_range
  ON dispatch.cargo_sensor_readings (out_of_range, reading_at DESC)
  WHERE out_of_range = true;

CREATE INDEX IF NOT EXISTS idx_cargo_sensor_trailer
  ON dispatch.cargo_sensor_readings (trailer_uuid, reading_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cargo_sensor_reading
  ON dispatch.cargo_sensor_readings (operating_company_id, sensor_id, reading_at);

ALTER TABLE dispatch.cargo_sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.cargo_sensor_readings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cargo_sensor_readings_tenant_isolation ON dispatch.cargo_sensor_readings;
CREATE POLICY cargo_sensor_readings_tenant_isolation ON dispatch.cargo_sensor_readings
  USING (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()));

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT ON dispatch.cargo_sensor_readings TO ih35_app;

COMMIT;
