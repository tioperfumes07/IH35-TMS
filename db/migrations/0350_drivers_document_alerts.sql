-- Block A24-9: driver document expiry alert engine (rules + events)
-- ARCHIVE-not-DELETE: centralizes permit panel + DQF chips; legacy surfaces remain.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.document_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (
    document_type IN ('cdl', 'medical_card', 'training', 'dqf', 'doc_file', 'permit', 'hazmat')
  ),
  rule_name text NOT NULL,
  days_before_expiry integer[] NOT NULL DEFAULT ARRAY[90, 60, 30, 7],
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  notify_email boolean NOT NULL DEFAULT true,
  notify_in_app boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_alert_rules_company_type UNIQUE (operating_company_id, document_type)
);

CREATE TABLE IF NOT EXISTS safety.document_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES safety.document_alert_rules(id) ON DELETE CASCADE,
  driver_id uuid NULL,
  document_type text NOT NULL,
  source_id text NOT NULL,
  subject_key text NOT NULL,
  expiry_date date NOT NULL,
  days_until_expiry integer NOT NULL,
  detection_summary text NOT NULL,
  detection_metric jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_status text NOT NULL DEFAULT 'open' CHECK (event_status IN ('open', 'acknowledged', 'resolved')),
  notified_at timestamptz NULL,
  acknowledged_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz NULL,
  acknowledgment_note text NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_alert_events_dedup UNIQUE (operating_company_id, rule_id, subject_key, days_until_expiry)
);

CREATE INDEX IF NOT EXISTS idx_document_alert_rules_company_enabled
  ON safety.document_alert_rules (operating_company_id, enabled);

CREATE INDEX IF NOT EXISTS idx_document_alert_events_company_status
  ON safety.document_alert_events (operating_company_id, event_status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_alert_events_driver
  ON safety.document_alert_events (operating_company_id, driver_id, detected_at DESC);

DROP TRIGGER IF EXISTS trg_document_alert_rules_touch_updated_at ON safety.document_alert_rules;
CREATE TRIGGER trg_document_alert_rules_touch_updated_at
  BEFORE UPDATE ON safety.document_alert_rules
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

DROP TRIGGER IF EXISTS trg_document_alert_events_touch_updated_at ON safety.document_alert_events;
CREATE TRIGGER trg_document_alert_events_touch_updated_at
  BEFORE UPDATE ON safety.document_alert_events
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

ALTER TABLE safety.document_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.document_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_alert_rules_tenant_scope ON safety.document_alert_rules;
CREATE POLICY document_alert_rules_tenant_scope
  ON safety.document_alert_rules
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS document_alert_events_tenant_scope ON safety.document_alert_events;
CREATE POLICY document_alert_events_tenant_scope
  ON safety.document_alert_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.document_alert_rules TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.document_alert_events TO ih35_app;

INSERT INTO safety.document_alert_rules (
  operating_company_id,
  document_type,
  rule_name,
  days_before_expiry,
  severity,
  enabled
)
SELECT
  c.id,
  seed.document_type,
  seed.rule_name,
  seed.days_before_expiry,
  seed.severity,
  true
FROM org.companies c
CROSS JOIN (
  VALUES
    ('cdl', 'CDL expiration', ARRAY[90, 60, 30, 7]::integer[], 'critical'),
    ('medical_card', 'DOT medical card', ARRAY[90, 60, 30, 7]::integer[], 'critical'),
    ('training', 'Training certificate', ARRAY[90, 60, 30, 7]::integer[], 'warning'),
    ('dqf', 'DQF checklist item', ARRAY[90, 60, 30, 7]::integer[], 'warning'),
    ('doc_file', 'Driver uploaded document', ARRAY[60, 30, 7]::integer[], 'warning'),
    ('permit', 'Operating permit', ARRAY[90, 60, 30, 7]::integer[], 'warning'),
    ('hazmat', 'Hazmat endorsement', ARRAY[90, 60, 30, 7]::integer[], 'critical')
) AS seed(document_type, rule_name, days_before_expiry, severity)
ON CONFLICT (operating_company_id, document_type) DO NOTHING;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS safety.document_alert_events;
-- DROP TABLE IF EXISTS safety.document_alert_rules;
