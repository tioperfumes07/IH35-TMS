-- P7 Wave 2 v3 — integrations.qbo_sync_conflicts.

BEGIN;

CREATE TABLE IF NOT EXISTS integrations.qbo_sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  qbo_id text,
  tms_snapshot jsonb NOT NULL,
  qbo_snapshot jsonb NOT NULL,
  conflict_fields text[] NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text CHECK (
    resolution IS NULL OR resolution IN ('qbo_wins', 'tms_wins', 'manual_merge', 'dismissed')
  ),
  resolved_by_user_id uuid REFERENCES identity.users(id),
  resolution_notes text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_sync_conflicts_company_open ON integrations.qbo_sync_conflicts (operating_company_id, detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_sync_conflicts_company_entity ON integrations.qbo_sync_conflicts (operating_company_id, entity_type, entity_id);

ALTER TABLE integrations.qbo_sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.qbo_sync_conflicts FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON integrations.qbo_sync_conflicts TO ih35_app;

DROP POLICY IF EXISTS qbo_sync_conflicts_select_office ON integrations.qbo_sync_conflicts;
CREATE POLICY qbo_sync_conflicts_select_office ON integrations.qbo_sync_conflicts
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Accountant'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS qbo_sync_conflicts_mutate_worker ON integrations.qbo_sync_conflicts;
CREATE POLICY qbo_sync_conflicts_mutate_worker ON integrations.qbo_sync_conflicts
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Accountant'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
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
          'Accountant'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

COMMIT;
