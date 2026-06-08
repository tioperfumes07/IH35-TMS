-- GAP-56 / CAP-4: auto status switch events and position snapshots for movement drift detection.
BEGIN;

CREATE TABLE IF NOT EXISTS integrations.auto_status_switch_events (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_uuid UUID NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  unit_uuid UUID REFERENCES mdata.units(id) ON DELETE SET NULL,
  driver_uuid UUID REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  case_id TEXT NOT NULL CHECK (case_id IN ('A', 'B', 'C')),
  from_status TEXT NOT NULL,
  to_status TEXT,
  reason TEXT NOT NULL,
  auto_switched BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  driver_notified BOOLEAN NOT NULL DEFAULT false,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_auto_status_switch_evidence_object CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_auto_status_switch_events_company_created
  ON integrations.auto_status_switch_events(operating_company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_status_switch_events_load
  ON integrations.auto_status_switch_events(load_uuid, created_at DESC);

CREATE TABLE IF NOT EXISTS integrations.auto_status_position_snapshots (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  unit_uuid UUID NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed_mph DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_status_pos_snap_unit_recorded
  ON integrations.auto_status_position_snapshots(operating_company_id, unit_uuid, recorded_at DESC);

ALTER TABLE integrations.auto_status_switch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.auto_status_position_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_auto_status_switch_events_tenant ON integrations.auto_status_switch_events;
CREATE POLICY rls_auto_status_switch_events_tenant ON integrations.auto_status_switch_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_auto_status_pos_snap_tenant ON integrations.auto_status_position_snapshots;
CREATE POLICY rls_auto_status_pos_snap_tenant ON integrations.auto_status_position_snapshots
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT USAGE ON SCHEMA integrations TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.auto_status_switch_events TO ih35_app;
GRANT SELECT, INSERT, DELETE ON integrations.auto_status_position_snapshots TO ih35_app;

COMMIT;
