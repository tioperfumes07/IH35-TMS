BEGIN;

CREATE SCHEMA IF NOT EXISTS integrations;

CREATE TABLE IF NOT EXISTS integrations.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  last_refreshed_at timestamptz,
  last_used_at timestamptz,
  authorized_by_user_id uuid REFERENCES identity.users(id),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qbo_connections_active_company_realm
  ON integrations.qbo_connections (operating_company_id, realm_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_connections_company_active
  ON integrations.qbo_connections (operating_company_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_connections_refresh_expiry_active
  ON integrations.qbo_connections (refresh_token_expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE integrations.qbo_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_connections_company_scope ON integrations.qbo_connections;
CREATE POLICY qbo_connections_company_scope
  ON integrations.qbo_connections
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON integrations.qbo_connections TO ih35_app;

COMMIT;

