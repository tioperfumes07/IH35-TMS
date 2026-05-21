BEGIN;

ALTER TABLE mdata.qbo_classes
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_classes
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_classes
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_classes_last_seen_at
  ON mdata.qbo_classes (operating_company_id, last_seen_at);

ALTER TABLE mdata.qbo_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_classes FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_classes TO ih35_app;

DROP POLICY IF EXISTS qbo_classes_select_office ON mdata.qbo_classes;
CREATE POLICY qbo_classes_select_office ON mdata.qbo_classes
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS qbo_classes_sync_all ON mdata.qbo_classes;
CREATE POLICY qbo_classes_sync_all ON mdata.qbo_classes
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_classes_mutate_office ON mdata.qbo_classes;
CREATE POLICY qbo_classes_mutate_office ON mdata.qbo_classes
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_classes_update_office ON mdata.qbo_classes;
CREATE POLICY qbo_classes_update_office ON mdata.qbo_classes
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

COMMIT;
