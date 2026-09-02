-- GO-20 slice D: group cargo sensor readings into durable, voidable incidents.
-- Schema only: watcher/routes/UI are independently owned; no fixture or production row is created.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.cargo_sensor_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NULL REFERENCES mdata.loads(id),
  trailer_id uuid NULL REFERENCES mdata.equipment(id),
  unit_id uuid NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  customer_id uuid NULL REFERENCES mdata.customers(id),
  sensor_id text NOT NULL,
  breach_kind text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  duration_minutes integer NULL,
  reading_count integer NOT NULL DEFAULT 1,
  worst_value numeric NULL,
  threshold_low numeric NULL,
  threshold_high numeric NULL,
  severity text NOT NULL,
  first_reading_uuid uuid NULL REFERENCES dispatch.cargo_sensor_readings(uuid),
  last_reading_uuid uuid NULL REFERENCES dispatch.cargo_sensor_readings(uuid),
  customer_notified_at timestamptz NULL,
  claim_incident_id uuid NULL REFERENCES safety.incidents(id),
  resolved_at timestamptz NULL,
  resolved_by_user_id uuid NULL REFERENCES identity.users(id),
  resolution_note text NULL,
  voided_at timestamptz NULL,
  voided_by_user_id uuid NULL REFERENCES identity.users(id),
  void_reason text NULL,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cargo_sensor_incidents_breach_kind_check'
      AND conrelid = 'dispatch.cargo_sensor_incidents'::regclass
  ) THEN
    ALTER TABLE dispatch.cargo_sensor_incidents
      ADD CONSTRAINT cargo_sensor_incidents_breach_kind_check
      CHECK (breach_kind IN ('temperature', 'humidity', 'door'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cargo_incident_open_per_sensor_kind
  ON dispatch.cargo_sensor_incidents (operating_company_id, sensor_id, breach_kind)
  WHERE ended_at IS NULL AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_cargo_incident_open_critical
  ON dispatch.cargo_sensor_incidents (operating_company_id, started_at DESC)
  WHERE resolved_at IS NULL AND voided_at IS NULL;



CREATE INDEX IF NOT EXISTS ix_cargo_incident_load
  ON dispatch.cargo_sensor_incidents (operating_company_id, load_id, started_at DESC)
  WHERE voided_at IS NULL;
ALTER TABLE dispatch.cargo_sensor_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.cargo_sensor_incidents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cargo_sensor_incidents_company_scope ON dispatch.cargo_sensor_incidents;
CREATE POLICY cargo_sensor_incidents_company_scope
  ON dispatch.cargo_sensor_incidents
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
GRANT SELECT, INSERT, UPDATE ON dispatch.cargo_sensor_incidents TO ih35_app;
REVOKE DELETE ON dispatch.cargo_sensor_incidents FROM ih35_app;

COMMIT;
