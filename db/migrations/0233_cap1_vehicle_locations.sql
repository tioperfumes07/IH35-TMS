-- CAP-1: real-time GPS history foundation for telematics consumers.
BEGIN;

CREATE SCHEMA IF NOT EXISTS telematics;

CREATE TABLE IF NOT EXISTS telematics.vehicle_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  samsara_vehicle_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  speed_mph numeric(5,1) NULL CHECK (speed_mph IS NULL OR speed_mph >= 0),
  heading_deg numeric(5,2) NULL CHECK (heading_deg IS NULL OR (heading_deg >= 0 AND heading_deg < 360)),
  engine_state text NOT NULL DEFAULT 'unknown' CHECK (engine_state IN ('on', 'off', 'idle', 'unknown')),
  raw_samsara_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_locations_tenant_event_unique UNIQUE (operating_company_id, raw_samsara_event_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_unit_time
  ON telematics.vehicle_locations (operating_company_id, unit_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_tenant_time
  ON telematics.vehicle_locations (operating_company_id, captured_at DESC);

CREATE OR REPLACE VIEW telematics.vehicle_latest_position AS
SELECT DISTINCT ON (v.operating_company_id, v.unit_id)
  v.id,
  v.operating_company_id,
  v.unit_id,
  v.samsara_vehicle_id,
  v.captured_at,
  v.lat,
  v.lng,
  v.speed_mph,
  v.heading_deg,
  v.engine_state,
  v.raw_samsara_event_id
FROM telematics.vehicle_locations v
ORDER BY v.operating_company_id, v.unit_id, v.captured_at DESC, v.created_at DESC;

CREATE OR REPLACE FUNCTION telematics.block_vehicle_locations_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'telematics.vehicle_locations is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_vehicle_locations_update ON telematics.vehicle_locations;
CREATE TRIGGER trg_block_vehicle_locations_update
BEFORE UPDATE ON telematics.vehicle_locations
FOR EACH ROW
EXECUTE FUNCTION telematics.block_vehicle_locations_mutation();

DROP TRIGGER IF EXISTS trg_block_vehicle_locations_delete ON telematics.vehicle_locations;
CREATE TRIGGER trg_block_vehicle_locations_delete
BEFORE DELETE ON telematics.vehicle_locations
FOR EACH ROW
EXECUTE FUNCTION telematics.block_vehicle_locations_mutation();

ALTER TABLE telematics.vehicle_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_locations_company_scope ON telematics.vehicle_locations;
CREATE POLICY vehicle_locations_company_scope ON telematics.vehicle_locations
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA telematics TO ih35_app;
GRANT SELECT ON telematics.vehicle_latest_position TO ih35_app;
GRANT SELECT, INSERT ON telematics.vehicle_locations TO ih35_app;
REVOKE UPDATE, DELETE ON telematics.vehicle_locations FROM PUBLIC;
REVOKE UPDATE, DELETE ON telematics.vehicle_locations FROM ih35_app;

COMMIT;
