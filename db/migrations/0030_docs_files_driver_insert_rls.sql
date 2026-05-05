BEGIN;

DROP POLICY IF EXISTS files_insert ON docs.files;

CREATE POLICY files_insert_office
  ON docs.files
  FOR INSERT
  TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum,
        'Safety'::identity.role_enum,
        'Accountant'::identity.role_enum,
        'Mechanic'::identity.role_enum
      ]
    )
  );

DROP POLICY IF EXISTS drivers_insert_own_files ON docs.files;

CREATE POLICY drivers_insert_own_files
  ON docs.files
  FOR INSERT
  TO ih35_app
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM identity.users u
      WHERE u.id = identity.current_user_id()
        AND u.role = 'Driver'
    )
    AND operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS drivers_select_own_files ON docs.files;

CREATE POLICY drivers_select_own_files
  ON docs.files
  FOR SELECT
  TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM docs.file_links fl
      JOIN mdata.drivers d ON d.id = fl.entity_id
      WHERE fl.file_id = docs.files.id
        AND fl.entity_type = 'driver'
        AND d.identity_user_id = identity.current_user_id()
        AND fl.deleted_at IS NULL
    )
  );

COMMIT;
