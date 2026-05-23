BEGIN;

CREATE SCHEMA IF NOT EXISTS compliance;

DO $$
DECLARE
  con_row record;
BEGIN
  FOR con_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'geo.geofences'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%location_kind%'
  LOOP
    EXECUTE format('ALTER TABLE geo.geofences DROP CONSTRAINT IF EXISTS %I', con_row.conname);
  END LOOP;
END
$$;

ALTER TABLE geo.geofences
  ADD CONSTRAINT geo_geofences_location_kind_check
  CHECK (location_kind IN ('customer_site', 'yard', 'vendor_site', 'custom', 'dot_inspection_station'));

CREATE TABLE IF NOT EXISTS compliance.dot_inspection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  station_geofence_id uuid NOT NULL REFERENCES geo.geofences(id),
  arrived_at timestamptz NOT NULL,
  departed_at timestamptz NOT NULL,
  dwell_minutes int NOT NULL CHECK (dwell_minutes >= 0),
  follow_up_state text NOT NULL DEFAULT 'open' CHECK (follow_up_state IN ('open', 'reviewed', 'citation', 'clean')),
  follow_up_by_user_uuid uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dot_inspection_events_dedupe
  ON compliance.dot_inspection_events (operating_company_id, station_geofence_id, unit_id, arrived_at, departed_at);

CREATE INDEX IF NOT EXISTS ix_dot_inspection_events_company_created
  ON compliance.dot_inspection_events (operating_company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS compliance.dot_inspection_event_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  dot_inspection_event_id uuid NOT NULL REFERENCES compliance.dot_inspection_events(id),
  follow_up_state text NOT NULL CHECK (follow_up_state IN ('open', 'reviewed', 'citation', 'clean')),
  follow_up_by_user_uuid uuid NOT NULL REFERENCES identity.users(id),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_dot_inspection_followups_company_event
  ON compliance.dot_inspection_event_followups (operating_company_id, dot_inspection_event_id, created_at DESC);

CREATE OR REPLACE FUNCTION compliance.block_dot_inspection_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'compliance.dot_inspection_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_dot_inspection_events_block_update ON compliance.dot_inspection_events;
CREATE TRIGGER trg_dot_inspection_events_block_update
BEFORE UPDATE ON compliance.dot_inspection_events
FOR EACH ROW
EXECUTE FUNCTION compliance.block_dot_inspection_events_mutation();

DROP TRIGGER IF EXISTS trg_dot_inspection_events_block_delete ON compliance.dot_inspection_events;
CREATE TRIGGER trg_dot_inspection_events_block_delete
BEFORE DELETE ON compliance.dot_inspection_events
FOR EACH ROW
EXECUTE FUNCTION compliance.block_dot_inspection_events_mutation();

ALTER TABLE compliance.dot_inspection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.dot_inspection_event_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_dot_inspection_events_company ON compliance.dot_inspection_events;
CREATE POLICY rls_dot_inspection_events_company
ON compliance.dot_inspection_events
FOR ALL TO ih35_app
USING (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

DROP POLICY IF EXISTS rls_dot_inspection_followups_company ON compliance.dot_inspection_event_followups;
CREATE POLICY rls_dot_inspection_followups_company
ON compliance.dot_inspection_event_followups
FOR ALL TO ih35_app
USING (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

REVOKE UPDATE, DELETE ON compliance.dot_inspection_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON compliance.dot_inspection_events FROM ih35_app;

GRANT USAGE ON SCHEMA compliance TO ih35_app;
GRANT SELECT, INSERT ON compliance.dot_inspection_events TO ih35_app;
GRANT SELECT, INSERT ON compliance.dot_inspection_event_followups TO ih35_app;

COMMIT;
