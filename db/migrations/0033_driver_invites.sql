BEGIN;

CREATE TABLE IF NOT EXISTS identity.driver_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  identity_user_id UUID NOT NULL REFERENCES identity.users(id),
  token TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_driver_invites_token ON identity.driver_invites (token) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_driver_invites_driver ON identity.driver_invites (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_invites_phone ON identity.driver_invites (phone);

ALTER TABLE identity.driver_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_invites_select ON identity.driver_invites;
CREATE POLICY driver_invites_select ON identity.driver_invites
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = 'Owner'
    OR operating_company_id IN (
      SELECT company_id FROM org.user_company_access
      WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS driver_invites_insert ON identity.driver_invites;
CREATE POLICY driver_invites_insert ON identity.driver_invites
  FOR INSERT TO ih35_app
  WITH CHECK (true);

-- token redemption is system-triggered, no UPDATE policy by default -- uses lucia_bypass
GRANT SELECT, INSERT ON identity.driver_invites TO ih35_app;

COMMIT;
