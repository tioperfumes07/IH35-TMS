-- CAP-10: driver safety scoring source events from Samsara harsh-event payloads.
BEGIN;

CREATE TABLE IF NOT EXISTS safety.harsh_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  event_at timestamptz NOT NULL,
  event_kind text NOT NULL CHECK (
    event_kind IN (
      'harsh_brake',
      'harsh_accel',
      'harsh_turn',
      'speeding',
      'mobile_use',
      'distracted',
      'rolling_stop',
      'no_seatbelt'
    )
  ),
  severity text NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  raw_samsara_id text NOT NULL,
  speed_at_event_mph numeric(5,1) NULL CHECK (speed_at_event_mph IS NULL OR speed_at_event_mph >= 0),
  g_force numeric(4,2) NULL CHECK (g_force IS NULL OR g_force >= 0),
  latitude numeric(10,7) NULL,
  longitude numeric(10,7) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT harsh_events_per_tenant_unique UNIQUE (operating_company_id, raw_samsara_id)
);

CREATE INDEX IF NOT EXISTS idx_harsh_events_driver_window
  ON safety.harsh_events (operating_company_id, driver_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_harsh_events_unit_window
  ON safety.harsh_events (operating_company_id, unit_id, event_at DESC);

CREATE OR REPLACE FUNCTION safety.block_harsh_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.harsh_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_harsh_events_update ON safety.harsh_events;
CREATE TRIGGER trg_block_harsh_events_update
BEFORE UPDATE ON safety.harsh_events
FOR EACH ROW
EXECUTE FUNCTION safety.block_harsh_events_mutation();

DROP TRIGGER IF EXISTS trg_block_harsh_events_delete ON safety.harsh_events;
CREATE TRIGGER trg_block_harsh_events_delete
BEFORE DELETE ON safety.harsh_events
FOR EACH ROW
EXECUTE FUNCTION safety.block_harsh_events_mutation();

ALTER TABLE safety.harsh_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harsh_events_company_scope ON safety.harsh_events;
CREATE POLICY harsh_events_company_scope ON safety.harsh_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE UPDATE, DELETE ON safety.harsh_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON safety.harsh_events FROM ih35_app;
GRANT SELECT, INSERT ON safety.harsh_events TO ih35_app;

COMMIT;
