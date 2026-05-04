BEGIN;

DROP POLICY IF EXISTS users_phase0_all ON identity.users;
DROP POLICY IF EXISTS sessions_phase0_all ON identity.sessions;

ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    CREATE ROLE ih35_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT ih35_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA identity TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON identity.users TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.sessions TO ih35_app;

CREATE OR REPLACE FUNCTION identity.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_user_id text;
BEGIN
  raw_user_id := nullif(current_setting('app.current_user_id', true), '');
  IF raw_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_user_id::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION identity.current_user_role()
RETURNS identity.role_enum
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity, public
AS $$
DECLARE
  uid uuid;
  role_value identity.role_enum;
BEGIN
  uid := identity.current_user_id();
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.role
  INTO role_value
  FROM identity.users AS u
  WHERE u.id = uid
    AND u.deactivated_at IS NULL
  LIMIT 1;

  RETURN role_value;
END;
$$;

CREATE OR REPLACE FUNCTION identity.is_lucia_bypass()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN current_setting('app.bypass_rls', true) = 'lucia';
END;
$$;

DROP POLICY IF EXISTS users_select ON identity.users;
CREATE POLICY users_select
ON identity.users
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR id = identity.current_user_id()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP POLICY IF EXISTS users_insert ON identity.users;
CREATE POLICY users_insert
ON identity.users
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP POLICY IF EXISTS users_update ON identity.users;
CREATE POLICY users_update
ON identity.users
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR id = identity.current_user_id()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR id = identity.current_user_id()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP POLICY IF EXISTS sessions_all ON identity.sessions;
CREATE POLICY sessions_all
ON identity.sessions
FOR ALL
USING (identity.is_lucia_bypass())
WITH CHECK (identity.is_lucia_bypass());

COMMIT;
