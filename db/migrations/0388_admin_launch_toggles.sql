-- USMCA-3: carrier soft-launch toggle audit trail (is_active flip + admin.launch_toggles).
BEGIN;

CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.launch_toggles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  hidden BOOLEAN NOT NULL DEFAULT true,
  launched_at TIMESTAMPTZ,
  launched_by_user_id UUID REFERENCES identity.users(id),
  rollback_at TIMESTAMPTZ,
  rollback_by_user_id UUID REFERENCES identity.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_launch_toggles_company
  ON admin.launch_toggles(operating_company_id);

CREATE INDEX IF NOT EXISTS ix_launch_toggles_launched_at
  ON admin.launch_toggles(launched_at DESC NULLS LAST);

ALTER TABLE admin.launch_toggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.launch_toggles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS launch_toggles_owner_scope ON admin.launch_toggles;
CREATE POLICY launch_toggles_owner_scope
  ON admin.launch_toggles
  FOR ALL TO ih35_app
  USING (current_setting('app.bypass_rls', true) = 'lucia')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'lucia');

GRANT USAGE ON SCHEMA admin TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.launch_toggles TO ih35_app;

INSERT INTO admin.launch_toggles (operating_company_id, hidden, notes)
SELECT c.id, NOT c.is_active, 'Pre-seeded hidden carrier (USMCA-3)'
FROM org.companies c
WHERE c.code = 'USMCA'
  AND NOT c.is_active
ON CONFLICT (operating_company_id) DO NOTHING;

COMMIT;
