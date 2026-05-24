BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE IF NOT EXISTS safety.geofence_breach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vehicle_id uuid NOT NULL REFERENCES mdata.units(id),
  geofence_id uuid NOT NULL REFERENCES geo.geofences(id),
  customer_id uuid NULL REFERENCES mdata.customers(id),
  event_type text NOT NULL CHECK (event_type IN ('entry', 'exit')),
  event_at timestamptz NOT NULL,
  position_lat numeric(10,7) NOT NULL,
  position_lng numeric(10,7) NOT NULL,
  acknowledged_at timestamptz NULL,
  acknowledged_by uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_geofence_breach_events_company_event_at
  ON safety.geofence_breach_events (operating_company_id, event_at DESC);

CREATE INDEX IF NOT EXISTS ix_geofence_breach_events_vehicle_geofence_event_at
  ON safety.geofence_breach_events (vehicle_id, geofence_id, event_at DESC);

CREATE OR REPLACE FUNCTION safety.guard_geofence_breach_events_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW.operating_company_id = OLD.operating_company_id
    AND NEW.vehicle_id = OLD.vehicle_id
    AND NEW.geofence_id = OLD.geofence_id
    AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
    AND NEW.event_type = OLD.event_type
    AND NEW.event_at = OLD.event_at
    AND NEW.position_lat = OLD.position_lat
    AND NEW.position_lng = OLD.position_lng
    AND NEW.created_at = OLD.created_at
    AND OLD.acknowledged_at IS NULL
    AND NEW.acknowledged_at IS NOT NULL
    AND NEW.acknowledged_by IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'safety.geofence_breach_events is append-only except first acknowledge update';
END;
$$;

CREATE OR REPLACE FUNCTION safety.block_geofence_breach_events_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.geofence_breach_events is append-only — DELETE is not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_geofence_breach_events_guard_update ON safety.geofence_breach_events;
CREATE TRIGGER trg_geofence_breach_events_guard_update
BEFORE UPDATE ON safety.geofence_breach_events
FOR EACH ROW
EXECUTE FUNCTION safety.guard_geofence_breach_events_update();

DROP TRIGGER IF EXISTS trg_geofence_breach_events_block_delete ON safety.geofence_breach_events;
CREATE TRIGGER trg_geofence_breach_events_block_delete
BEFORE DELETE ON safety.geofence_breach_events
FOR EACH ROW
EXECUTE FUNCTION safety.block_geofence_breach_events_delete();

ALTER TABLE safety.geofence_breach_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geofence_breach_events_company_scope ON safety.geofence_breach_events;
CREATE POLICY geofence_breach_events_company_scope
ON safety.geofence_breach_events
FOR ALL TO ih35_app
USING (
  operating_company_id::text = current_setting('app.operating_company_id', true)
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id::text = current_setting('app.operating_company_id', true)
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.geofence_breach_events TO ih35_app;
REVOKE DELETE ON safety.geofence_breach_events FROM PUBLIC;
REVOKE DELETE ON safety.geofence_breach_events FROM ih35_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA safety TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON safety.geofence_breach_events TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA safety TO service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON safety.geofence_breach_events TO service_role';
  END IF;
END
$$;

COMMIT;
