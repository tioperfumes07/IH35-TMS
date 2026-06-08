-- GAP-19: Detention dwell evidence captured at manager approval.
-- Discrete evidence rows (NOT JSONB on invoice_lines) recording the dwell window
-- used to justify a billable detention charge. Timestamps are derived from
-- stop_arrivals / load_stops (labeled evidence_source = 'derived_from_stop_timestamps')
-- and the unit is resolved to its Samsara vehicle id via the integrations
-- projection (units → integrations.samsara_vehicles). Additive only.
--
-- Self-contained GRANT block (Block A schema grants just merged; keep this
-- migration independent so it applies cleanly in any order).
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.detention_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  detention_request_id uuid NOT NULL REFERENCES dispatch.detention_requests(id) ON DELETE CASCADE,
  detention_event_id uuid NOT NULL REFERENCES dispatch.detention_events(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES mdata.load_stops(id) ON DELETE CASCADE,
  unit_id uuid NULL REFERENCES mdata.units(id),
  samsara_vehicle_id text NULL,
  arrival_at timestamptz NULL,
  departure_at timestamptz NULL,
  dwell_minutes int NOT NULL DEFAULT 0 CHECK (dwell_minutes >= 0),
  free_time_minutes int NOT NULL DEFAULT 0 CHECK (free_time_minutes >= 0),
  billable_minutes int NOT NULL DEFAULT 0 CHECK (billable_minutes >= 0),
  evidence_source text NOT NULL DEFAULT 'derived_from_stop_timestamps',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detention_evidence_request
  ON dispatch.detention_evidence (detention_request_id);

CREATE INDEX IF NOT EXISTS idx_detention_evidence_company
  ON dispatch.detention_evidence (operating_company_id, created_at DESC);

ALTER TABLE dispatch.detention_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detention_evidence_company_scope ON dispatch.detention_evidence;
CREATE POLICY detention_evidence_company_scope
  ON dispatch.detention_evidence
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- Self-contained GRANT block.
GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.detention_evidence TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dispatch TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA dispatch GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

COMMIT;
