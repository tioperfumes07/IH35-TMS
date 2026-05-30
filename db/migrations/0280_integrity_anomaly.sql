BEGIN;

CREATE SCHEMA IF NOT EXISTS integrity;

CREATE TABLE IF NOT EXISTS integrity.anomalies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  anomaly_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  subject_type text NOT NULL CHECK (subject_type IN ('driver', 'unit', 'customer', 'invoice')),
  subject_id uuid NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  detector_version text NOT NULL,
  evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved', 'dismissed')),
  status_changed_at timestamptz,
  status_changed_by uuid,
  resolution_note text
);

CREATE INDEX IF NOT EXISTS idx_integrity_anomalies_tenant_status
  ON integrity.anomalies (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_integrity_anomalies_tenant_severity_detected
  ON integrity.anomalies (tenant_id, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_integrity_anomalies_tenant_subject
  ON integrity.anomalies (tenant_id, subject_type, subject_id);

GRANT SELECT, INSERT, UPDATE ON integrity.anomalies TO neondb_owner;

ALTER TABLE integrity.anomalies ENABLE ROW LEVEL SECURITY;

ALTER TABLE integrity.anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomalies_tenant_scope ON integrity.anomalies;
CREATE POLICY anomalies_tenant_scope
  ON integrity.anomalies
  FOR ALL
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON integrity.anomalies TO neondb_owner;

COMMIT;
