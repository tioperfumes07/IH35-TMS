-- P7 — Integration sync observability log (additive).

BEGIN;

CREATE TABLE IF NOT EXISTS integrations.integration_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  integration text NOT NULL,
  sync_kind text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  success boolean,
  rows_added integer,
  rows_updated integer,
  rows_removed integer,
  error_message text,
  payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_log_company_started
  ON integrations.integration_sync_log (operating_company_id, started_at DESC);

ALTER TABLE integrations.integration_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.integration_sync_log FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON integrations.integration_sync_log TO ih35_app;

DROP POLICY IF EXISTS integration_sync_log_select_office ON integrations.integration_sync_log;
CREATE POLICY integration_sync_log_select_office ON integrations.integration_sync_log
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

DROP POLICY IF EXISTS integration_sync_log_insert_bypass ON integrations.integration_sync_log;
CREATE POLICY integration_sync_log_insert_bypass ON integrations.integration_sync_log
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
    )
  );

COMMIT;
