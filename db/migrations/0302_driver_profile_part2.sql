-- Block 14: Driver Profile Part 2 — border ops credentials + driver profile messages
BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS fast_card_number text,
  ADD COLUMN IF NOT EXISTS fast_card_expiration date,
  ADD COLUMN IF NOT EXISTS sentri_member boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sentri_expiration date,
  ADD COLUMN IF NOT EXISTS twic_card_number text,
  ADD COLUMN IF NOT EXISTS twic_expiration date,
  ADD COLUMN IF NOT EXISTS passport_country text,
  ADD COLUMN IF NOT EXISTS mexican_license_number text,
  ADD COLUMN IF NOT EXISTS mexican_license_expiration date,
  ADD COLUMN IF NOT EXISTS visa_b1_status text;

CREATE TABLE IF NOT EXISTS mdata.driver_profile_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  message text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  urgency text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_profile_messages_driver
  ON mdata.driver_profile_messages (operating_company_id, driver_id, created_at DESC);

ALTER TABLE mdata.driver_profile_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_profile_messages_tenant_scope ON mdata.driver_profile_messages;
CREATE POLICY driver_profile_messages_tenant_scope
  ON mdata.driver_profile_messages
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON mdata.driver_profile_messages TO ih35_app;

COMMIT;
