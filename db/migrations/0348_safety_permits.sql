-- Block A23-13: safety.permits + permit renewal reminder config
-- Per-state operating authority tracking + configurable days-before-expiry alerts.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  permit_type text NOT NULL CHECK (
    permit_type IN (
      'state_operating_authority',
      'ifta_sticker',
      'oversize_overweight',
      'hazmat',
      'other'
    )
  ),
  permit_number text NOT NULL DEFAULT '',
  issuing_state text NULL,
  holder_name text NOT NULL DEFAULT '',
  issued_date date NULL,
  expiry_date date NOT NULL,
  unit_id uuid NULL REFERENCES mdata.units(id) ON DELETE SET NULL,
  notes text NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS safety.permit_renewal_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  days_before_expiry integer NOT NULL DEFAULT 30 CHECK (days_before_expiry BETWEEN 1 AND 365),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_permit_renewal_reminders_company UNIQUE (operating_company_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_permits_company_active
  ON safety.permits (operating_company_id, expiry_date)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_safety_permits_company_type
  ON safety.permits (operating_company_id, permit_type)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_safety_permits_touch_updated_at ON safety.permits;
CREATE TRIGGER trg_safety_permits_touch_updated_at
  BEFORE UPDATE ON safety.permits
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

DROP TRIGGER IF EXISTS trg_permit_renewal_reminders_touch_updated_at ON safety.permit_renewal_reminders;
CREATE TRIGGER trg_permit_renewal_reminders_touch_updated_at
  BEFORE UPDATE ON safety.permit_renewal_reminders
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

ALTER TABLE safety.permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.permit_renewal_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_permits_tenant_scope ON safety.permits;
CREATE POLICY safety_permits_tenant_scope
  ON safety.permits
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS permit_renewal_reminders_tenant_scope ON safety.permit_renewal_reminders;
CREATE POLICY permit_renewal_reminders_tenant_scope
  ON safety.permit_renewal_reminders
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.permits TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.permit_renewal_reminders TO ih35_app;

INSERT INTO safety.permit_renewal_reminders (operating_company_id, days_before_expiry, enabled)
SELECT c.id, 30, true
FROM org.companies c
ON CONFLICT (operating_company_id) DO NOTHING;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS safety.permit_renewal_reminders;
-- DROP TABLE IF EXISTS safety.permits;
