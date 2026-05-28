BEGIN;

CREATE TABLE IF NOT EXISTS safety.compliance_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  due_date DATE NOT NULL,
  days_to_expiry INTEGER NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, source_type, source_id, due_date),
  CHECK (source_type IN ('driver_qualification', 'medical_card', 'background_check', 'training_record')),
  CHECK (severity IN ('warning', 'critical', 'expired')),
  CHECK (status IN ('open', 'dismissed', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_safety_reminders_company_status_due
  ON safety.compliance_reminders (operating_company_id, status, due_date ASC);

CREATE INDEX IF NOT EXISTS idx_safety_reminders_driver_open
  ON safety.compliance_reminders (driver_id, due_date ASC)
  WHERE status = 'open';

ALTER TABLE safety.compliance_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_compliance_reminders_tenant_scope ON safety.compliance_reminders;
CREATE POLICY safety_compliance_reminders_tenant_scope
  ON safety.compliance_reminders
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.compliance_reminders TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_compliance_reminders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_compliance_reminders_updated_at ON safety.compliance_reminders;
CREATE TRIGGER trg_touch_compliance_reminders_updated_at
BEFORE UPDATE ON safety.compliance_reminders
FOR EACH ROW
EXECUTE FUNCTION safety.touch_compliance_reminders_updated_at();

COMMIT;
