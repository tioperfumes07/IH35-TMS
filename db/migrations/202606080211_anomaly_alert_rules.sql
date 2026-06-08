-- GAP-46: Integrity anomaly detection alert engine (non-financial operational/integrity rules).
BEGIN;

CREATE TABLE IF NOT EXISTS safety.anomaly_alert_rules (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  rule_slug TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('financial','operational','security','integrity')),
  detector_function TEXT NOT NULL,
  threshold_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','high','critical')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notify_roles TEXT[] NOT NULL DEFAULT ARRAY['Owner','Administrator']::text[],
  cadence_minutes INTEGER NOT NULL DEFAULT 360,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, rule_slug)
);

CREATE TABLE IF NOT EXISTS safety.anomaly_alerts (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  rule_uuid UUID NOT NULL REFERENCES safety.anomaly_alert_rules(uuid),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL,
  subject_kind TEXT,
  subject_uuid UUID,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_uuid UUID,
  resolution_status TEXT NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open','investigating','resolved','false_positive')),
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_open
  ON safety.anomaly_alerts(detected_at DESC)
  WHERE resolution_status = 'open';

ALTER TABLE safety.anomaly_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.anomaly_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_anomaly_rules_company ON safety.anomaly_alert_rules;
CREATE POLICY rls_anomaly_rules_company ON safety.anomaly_alert_rules
  FOR ALL TO ih35_app
  USING (operating_company_id = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia')
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia');

DROP POLICY IF EXISTS rls_anomaly_alerts_company ON safety.anomaly_alerts;
CREATE POLICY rls_anomaly_alerts_company ON safety.anomaly_alerts
  FOR ALL TO ih35_app
  USING (operating_company_id = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia')
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia');

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.anomaly_alert_rules TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.anomaly_alerts TO ih35_app;

COMMIT;
