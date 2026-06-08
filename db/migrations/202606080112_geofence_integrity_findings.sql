-- GAP-27: Geofence reconciliation findings storage.
-- Daily audit findings from the geofence reconciliation job.
BEGIN;

CREATE TABLE IF NOT EXISTS safety.integrity_findings (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  report_date DATE NOT NULL,
  anomaly_class TEXT NOT NULL CHECK (anomaly_class IN ('orphan_entry','orphan_exit','duplicate_fire','expected_missing')),
  geofence_id TEXT,
  unit_id TEXT,
  load_uuid UUID,
  occurred_at TIMESTAMPTZ,
  details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by_user_uuid UUID,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gif_company_date
  ON safety.integrity_findings(operating_company_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_gif_anomaly_class
  ON safety.integrity_findings(operating_company_id, anomaly_class, resolved);

ALTER TABLE safety.integrity_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_safety_integrity_findings_company ON safety.integrity_findings;
CREATE POLICY rls_safety_integrity_findings_company
  ON safety.integrity_findings
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.integrity_findings TO ih35_app;

COMMIT;
