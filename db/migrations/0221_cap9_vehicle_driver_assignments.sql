-- CAP-9 (Phase 5 Telematics): vehicle-driver assignment pairing at event time.
BEGIN;

CREATE SCHEMA IF NOT EXISTS telematics;

CREATE TABLE IF NOT EXISTS telematics.vehicle_driver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  source text NOT NULL CHECK (source IN ('samsara_webhook', 'manual_override', 'reconciled')),
  raw_event_id uuid NULL REFERENCES integrations.samsara_webhook_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_uuid uuid NULL REFERENCES identity.users(id),
  CONSTRAINT vehicle_driver_assignments_interval_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_driver_assignments_unit_time
  ON telematics.vehicle_driver_assignments (operating_company_id, unit_id, started_at DESC, ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_driver_assignments_driver_time
  ON telematics.vehicle_driver_assignments (operating_company_id, driver_id, started_at DESC, ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_driver_assignments_open
  ON telematics.vehicle_driver_assignments (operating_company_id, unit_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_driver_assignments_event
  ON telematics.vehicle_driver_assignments (raw_event_id)
  WHERE raw_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION telematics.block_vehicle_driver_assignments_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id <> NEW.id
    OR OLD.operating_company_id <> NEW.operating_company_id
    OR OLD.unit_id <> NEW.unit_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.started_at <> NEW.started_at
    OR OLD.source <> NEW.source
    OR OLD.raw_event_id IS DISTINCT FROM NEW.raw_event_id
    OR OLD.created_at <> NEW.created_at
    OR OLD.created_by_user_uuid IS DISTINCT FROM NEW.created_by_user_uuid THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments immutable columns cannot be updated';
  END IF;

  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments ended_at cannot be changed once set';
  END IF;

  IF NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments UPDATE must set ended_at';
  END IF;

  IF NEW.ended_at < OLD.started_at THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments ended_at must be >= started_at';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_vehicle_driver_assignments_update ON telematics.vehicle_driver_assignments;
CREATE TRIGGER trg_block_vehicle_driver_assignments_update
BEFORE UPDATE ON telematics.vehicle_driver_assignments
FOR EACH ROW
EXECUTE FUNCTION telematics.block_vehicle_driver_assignments_update();

CREATE OR REPLACE FUNCTION telematics.block_vehicle_driver_assignments_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'telematics.vehicle_driver_assignments is append-only — DELETE is not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_vehicle_driver_assignments_delete ON telematics.vehicle_driver_assignments;
CREATE TRIGGER trg_block_vehicle_driver_assignments_delete
BEFORE DELETE ON telematics.vehicle_driver_assignments
FOR EACH ROW
EXECUTE FUNCTION telematics.block_vehicle_driver_assignments_delete();

ALTER TABLE telematics.vehicle_driver_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_driver_assignments_company_scope ON telematics.vehicle_driver_assignments;
CREATE POLICY vehicle_driver_assignments_company_scope
  ON telematics.vehicle_driver_assignments
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE DELETE ON telematics.vehicle_driver_assignments FROM PUBLIC;
REVOKE DELETE ON telematics.vehicle_driver_assignments FROM ih35_app;
GRANT USAGE ON SCHEMA telematics TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON telematics.vehicle_driver_assignments TO ih35_app;

COMMIT;
