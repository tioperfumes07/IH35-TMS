-- Block 16: Compliance Dashboard — notification rules + log + carrier credential columns
BEGIN;

CREATE SCHEMA IF NOT EXISTS compliance;

CREATE TABLE IF NOT EXISTS compliance.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  credential_type text NOT NULL,
  entity_scope text NOT NULL CHECK (entity_scope IN ('all', 'specific', 'role')),
  recipient_user_ids uuid[],
  recipient_emails text[],
  notify_days_before integer[] DEFAULT ARRAY[30, 14, 7, 1],
  channel text[] DEFAULT ARRAY['email', 'in_app'],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_rules_company ON compliance.notification_rules (operating_company_id);

ALTER TABLE compliance.notification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_rules_company_isolation ON compliance.notification_rules;
CREATE POLICY notif_rules_company_isolation ON compliance.notification_rules
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

CREATE TABLE IF NOT EXISTS compliance.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  rule_id uuid REFERENCES compliance.notification_rules(id),
  credential_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  expiration_date date,
  days_until_expiration integer,
  sent_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'delivered', 'bounced'))
);

CREATE INDEX IF NOT EXISTS idx_notif_log_company ON compliance.notification_log (operating_company_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_entity ON compliance.notification_log (entity_type, entity_id);

ALTER TABLE compliance.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_log_company_isolation ON compliance.notification_log;
CREATE POLICY notif_log_company_isolation ON compliance.notification_log
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

ALTER TABLE org.companies
  ADD COLUMN IF NOT EXISTS usdot_number text,
  ADD COLUMN IF NOT EXISTS mc_number text,
  ADD COLUMN IF NOT EXISTS irp_account_number text,
  ADD COLUMN IF NOT EXISTS irp_account_expiration date,
  ADD COLUMN IF NOT EXISTS ifta_license_number text,
  ADD COLUMN IF NOT EXISTS ifta_license_expiration date,
  ADD COLUMN IF NOT EXISTS ucr_filing_year integer,
  ADD COLUMN IF NOT EXISTS scac_code text,
  ADD COLUMN IF NOT EXISTS eld_provider text,
  ADD COLUMN IF NOT EXISTS eld_certification_date date;

GRANT SELECT, INSERT, UPDATE ON compliance.notification_rules TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON compliance.notification_log TO ih35_app;

COMMIT;
