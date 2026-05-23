-- CAP-11 (Phase 5 Telematics): append-only duty status history for HOS clocks.
BEGIN;

CREATE SCHEMA IF NOT EXISTS hos;

CREATE TABLE IF NOT EXISTS hos.duty_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  unit_id uuid NULL REFERENCES mdata.units(id),
  duty_status text NOT NULL CHECK (
    duty_status IN (
      'off_duty',
      'sleeper',
      'driving',
      'on_duty_not_driving',
      'personal_conveyance',
      'yard_moves'
    )
  ),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  source text NOT NULL DEFAULT 'samsara_eld' CHECK (source IN ('samsara_eld', 'manual_edit')),
  odometer_mi integer NULL,
  location text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hos_duty_status_events_interval_check CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT hos_duty_status_events_odometer_check CHECK (odometer_mi IS NULL OR odometer_mi >= 0),
  CONSTRAINT hos_duty_status_events_dedupe UNIQUE (operating_company_id, driver_id, duty_status, started_at, source)
);

CREATE INDEX IF NOT EXISTS idx_hos_duty_status_events_driver_time
  ON hos.duty_status_events (operating_company_id, driver_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_hos_duty_status_events_open
  ON hos.duty_status_events (operating_company_id, driver_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION hos.block_duty_status_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hos.duty_status_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_hos_duty_status_events_update ON hos.duty_status_events;
CREATE TRIGGER trg_block_hos_duty_status_events_update
BEFORE UPDATE ON hos.duty_status_events
FOR EACH ROW
EXECUTE FUNCTION hos.block_duty_status_events_mutation();

DROP TRIGGER IF EXISTS trg_block_hos_duty_status_events_delete ON hos.duty_status_events;
CREATE TRIGGER trg_block_hos_duty_status_events_delete
BEFORE DELETE ON hos.duty_status_events
FOR EACH ROW
EXECUTE FUNCTION hos.block_duty_status_events_mutation();

ALTER TABLE hos.duty_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hos_duty_status_events_company_scope ON hos.duty_status_events;
CREATE POLICY hos_duty_status_events_company_scope ON hos.duty_status_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE UPDATE, DELETE ON hos.duty_status_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON hos.duty_status_events FROM ih35_app;
GRANT USAGE ON SCHEMA hos TO ih35_app;
GRANT SELECT, INSERT ON hos.duty_status_events TO ih35_app;

COMMIT;
