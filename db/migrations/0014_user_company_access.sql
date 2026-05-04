BEGIN;

CREATE TABLE IF NOT EXISTS org.user_company_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by_user_id uuid,
  deactivated_at timestamptz,
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_company_access_user
  ON org.user_company_access (user_id)
  WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_company_access_company
  ON org.user_company_access (company_id)
  WHERE deactivated_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON org.user_company_access TO ih35_app;

COMMENT ON TABLE org.user_company_access IS 'Grants individual users access to specific companies. Owner role users implicitly have access to all companies.';

ALTER TABLE org.user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.user_company_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uca_select_self_or_owner ON org.user_company_access;
CREATE POLICY uca_select_self_or_owner ON org.user_company_access
FOR SELECT TO ih35_app
USING (user_id = identity.current_user_id() OR identity.current_user_role() = 'Owner');

DROP POLICY IF EXISTS uca_insert_owner_only ON org.user_company_access;
CREATE POLICY uca_insert_owner_only ON org.user_company_access
FOR INSERT TO ih35_app
WITH CHECK (identity.current_user_role() = 'Owner');

DROP POLICY IF EXISTS uca_update_owner_only ON org.user_company_access;
CREATE POLICY uca_update_owner_only ON org.user_company_access
FOR UPDATE TO ih35_app
USING (identity.current_user_role() = 'Owner')
WITH CHECK (identity.current_user_role() = 'Owner');

DROP POLICY IF EXISTS uca_lucia_bypass ON org.user_company_access;
CREATE POLICY uca_lucia_bypass ON org.user_company_access
FOR ALL TO ih35_app
USING (identity.is_lucia_bypass())
WITH CHECK (identity.is_lucia_bypass());

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS default_company_id uuid REFERENCES org.companies(id);

COMMENT ON COLUMN identity.users.default_company_id IS 'The company shown by default when this user logs in. NULL means "first available alphabetically". Owner role can have any default; non-Owner users default to a company they have access to.';

CREATE OR REPLACE FUNCTION org.user_accessible_company_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org, identity
AS $$
BEGIN
  IF identity.current_user_role() = 'Owner' THEN
    RETURN QUERY
      SELECT id
      FROM org.companies
      WHERE deactivated_at IS NULL;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT uca.company_id
    FROM org.user_company_access uca
    JOIN org.companies c ON c.id = uca.company_id
    WHERE uca.user_id = identity.current_user_id()
      AND uca.deactivated_at IS NULL
      AND c.deactivated_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION org.user_accessible_company_ids() TO ih35_app;

INSERT INTO org.user_company_access (user_id, company_id)
SELECT u.id, c.id
FROM identity.users u
CROSS JOIN org.companies c
WHERE u.email = 'tioperfumes07@gmail.com'
  AND c.deactivated_at IS NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

UPDATE identity.users
SET default_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')
WHERE email = 'tioperfumes07@gmail.com';

COMMIT;
