-- Block 18: Shipper Portal MVP — portal users, sessions, load milestones
BEGIN;

CREATE SCHEMA IF NOT EXISTS shipper_portal;

CREATE TABLE IF NOT EXISTS shipper_portal.portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  customer_id UUID NOT NULL REFERENCES mdata.customers(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_dispatch BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_arrival BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_delivery BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_pod BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID,
  archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_email ON shipper_portal.portal_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_portal_users_customer ON shipper_portal.portal_users (customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_company ON shipper_portal.portal_users (operating_company_id);

ALTER TABLE shipper_portal.portal_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_users_company_isolation ON shipper_portal.portal_users;
CREATE POLICY portal_users_company_isolation ON shipper_portal.portal_users
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

CREATE TABLE IF NOT EXISTS shipper_portal.portal_sessions (
  id TEXT PRIMARY KEY,
  portal_user_id UUID NOT NULL REFERENCES shipper_portal.portal_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON shipper_portal.portal_sessions (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON shipper_portal.portal_sessions (expires_at);

CREATE TABLE IF NOT EXISTS shipper_portal.portal_password_reset_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID NOT NULL REFERENCES shipper_portal.portal_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_ip INET
);

CREATE INDEX IF NOT EXISTS idx_portal_reset_tokens_user ON shipper_portal.portal_password_reset_tokens (portal_user_id);

CREATE TABLE IF NOT EXISTS shipper_portal.load_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_id UUID NOT NULL,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN (
    'tendered','accepted','dispatched','en_route_to_pickup','arrived_at_pickup',
    'loaded','en_route_to_delivery','arrived_at_delivery','unloaded',
    'delivered','pod_uploaded','invoiced'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  email_notified_at TIMESTAMPTZ,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (load_id, milestone_type)
);

CREATE INDEX IF NOT EXISTS idx_load_milestones_load ON shipper_portal.load_milestones (load_id);
CREATE INDEX IF NOT EXISTS idx_load_milestones_occurred ON shipper_portal.load_milestones (occurred_at DESC);

ALTER TABLE shipper_portal.load_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS load_milestones_company_isolation ON shipper_portal.load_milestones;
CREATE POLICY load_milestones_company_isolation ON shipper_portal.load_milestones
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON shipper_portal.portal_users TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON shipper_portal.portal_sessions TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON shipper_portal.portal_password_reset_tokens TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON shipper_portal.load_milestones TO ih35_app;

COMMIT;
