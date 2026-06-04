-- Block A23-12: integrity alert rules + events (P6-T-INTEGRITY alert engine)
-- ARCHIVE-not-DELETE: extends safety.integrity_alerts; foundation views unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.integrity_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  rule_name text NOT NULL,
  source_view text NOT NULL,
  alert_category text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('driver','unit','vendor','unit_driver_pair','vendor_driver_pair')),
  threshold_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_integrity_alert_rules_company_code UNIQUE (operating_company_id, rule_code)
);

CREATE TABLE IF NOT EXISTS safety.integrity_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES safety.integrity_alert_rules(id) ON DELETE CASCADE,
  integrity_alert_id uuid NULL REFERENCES safety.integrity_alerts(id) ON DELETE SET NULL,
  subject_key text NOT NULL,
  detection_summary text NOT NULL,
  detection_metric jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_status text NOT NULL DEFAULT 'open' CHECK (event_status IN ('open','acknowledged','snoozed','resolved')),
  acknowledged_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz NULL,
  acknowledgment_note text NULL,
  snoozed_until timestamptz NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_integrity_alert_events_dedup UNIQUE (operating_company_id, rule_id, subject_key)
);

ALTER TABLE safety.integrity_alerts
  ADD COLUMN IF NOT EXISTS rule_id uuid NULL REFERENCES safety.integrity_alert_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id uuid NULL REFERENCES safety.integrity_alert_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_integrity_alert_rules_company_enabled
  ON safety.integrity_alert_rules (operating_company_id, enabled);

CREATE INDEX IF NOT EXISTS idx_integrity_alert_events_company_status
  ON safety.integrity_alert_events (operating_company_id, event_status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_integrity_alerts_snoozed_until
  ON safety.integrity_alerts (operating_company_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

DROP TRIGGER IF EXISTS trg_integrity_alert_rules_touch_updated_at ON safety.integrity_alert_rules;
CREATE TRIGGER trg_integrity_alert_rules_touch_updated_at
  BEFORE UPDATE ON safety.integrity_alert_rules
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

DROP TRIGGER IF EXISTS trg_integrity_alert_events_touch_updated_at ON safety.integrity_alert_events;
CREATE TRIGGER trg_integrity_alert_events_touch_updated_at
  BEFORE UPDATE ON safety.integrity_alert_events
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

ALTER TABLE safety.integrity_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.integrity_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integrity_alert_rules_tenant_scope ON safety.integrity_alert_rules;
CREATE POLICY integrity_alert_rules_tenant_scope
  ON safety.integrity_alert_rules
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS integrity_alert_events_tenant_scope ON safety.integrity_alert_events;
CREATE POLICY integrity_alert_events_tenant_scope
  ON safety.integrity_alert_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.integrity_alert_rules TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.integrity_alert_events TO ih35_app;

-- Seed default rules per company (idempotent)
INSERT INTO safety.integrity_alert_rules (
  operating_company_id,
  rule_code,
  rule_name,
  source_view,
  alert_category,
  subject_type,
  threshold_config,
  severity,
  enabled
)
SELECT
  c.id,
  seed.rule_code,
  seed.rule_name,
  seed.source_view,
  seed.alert_category,
  seed.subject_type,
  seed.threshold_config::jsonb,
  seed.severity,
  true
FROM org.companies c
CROSS JOIN (
  VALUES
    (
      'fuel_anomaly',
      'Fuel MPG anomaly',
      'safety.v_fuel_mpg_anomalies',
      'driver_mpg_anomaly',
      'driver',
      '{"min_rows":1}'::text,
      'warning'
    ),
    (
      'gps_spoof_pattern',
      'GPS / dwell outlier',
      'safety.v_driver_dwell_outliers',
      'driver_incident_frequency',
      'driver',
      '{"min_minutes_over_avg":120}'::text,
      'critical'
    ),
    (
      'odometer_cost_mismatch',
      'WO cost outlier (odometer proxy)',
      'safety.v_wo_cost_outliers',
      'unit_cost_anomaly',
      'unit',
      '{"min_z_score":2}'::text,
      'warning'
    )
) AS seed(rule_code, rule_name, source_view, alert_category, subject_type, threshold_config, severity)
ON CONFLICT (operating_company_id, rule_code) DO NOTHING;

COMMIT;

-- DOWN (manual rollback):
-- ALTER TABLE safety.integrity_alerts DROP COLUMN IF EXISTS snoozed_until, DROP COLUMN IF EXISTS event_id, DROP COLUMN IF EXISTS rule_id;
-- DROP TABLE IF EXISTS safety.integrity_alert_events;
-- DROP TABLE IF EXISTS safety.integrity_alert_rules;
