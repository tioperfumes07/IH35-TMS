-- GAP-51 DS-2: QBO reconciliation alert snapshots.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qbo;
CREATE TABLE IF NOT EXISTS qbo.reconciliation_alerts (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL DEFAULT 'default',
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_type TEXT NOT NULL,
  local_count INTEGER NOT NULL,
  qbo_count INTEGER NOT NULL,
  delta_pct NUMERIC(6,3) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  notified_at TIMESTAMPTZ NULL
);
ALTER TABLE qbo.reconciliation_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_qbo_recon_alerts ON qbo.reconciliation_alerts;
CREATE POLICY rls_qbo_recon_alerts ON qbo.reconciliation_alerts FOR ALL TO ih35_app
  USING (operating_company_id = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia')
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia');
GRANT USAGE ON SCHEMA qbo TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo.reconciliation_alerts TO ih35_app;
COMMIT;
