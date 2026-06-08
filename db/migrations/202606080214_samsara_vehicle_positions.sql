-- GAP-55: Live Samsara vehicle positions cache for CAP-1.
BEGIN;

CREATE TABLE IF NOT EXISTS integrations.samsara_vehicle_positions (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL,
  unit_uuid UUID NOT NULL,
  samsara_vehicle_id TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed_mph DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, unit_uuid)
);

CREATE INDEX IF NOT EXISTS idx_svp_company_recorded
  ON integrations.samsara_vehicle_positions(operating_company_id, recorded_at DESC);

ALTER TABLE integrations.samsara_vehicle_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_svp_tenant ON integrations.samsara_vehicle_positions;
CREATE POLICY rls_svp_tenant ON integrations.samsara_vehicle_positions
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA integrations TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_vehicle_positions TO ih35_app;

COMMIT;
