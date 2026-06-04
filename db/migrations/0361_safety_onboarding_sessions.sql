-- Block A24-8: safety.onboarding_sessions — multi-step driver onboarding wizard progress
-- NOTE: migration 0349 is reserved for A24-10 comm center (driver_comm_inbox);
-- migration 0360 is reserved for B28 maint_pm_auto_engine; this ships as 0361.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  driver_id uuid NULL REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  current_step smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 7),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  step_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_override boolean NOT NULL DEFAULT false,
  admin_override_reason text NULL,
  admin_override_by uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_company_status
  ON safety.onboarding_sessions (operating_company_id, status);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_driver
  ON safety.onboarding_sessions (driver_id)
  WHERE driver_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_onboarding_sessions_touch_updated_at ON safety.onboarding_sessions;
CREATE TRIGGER trg_onboarding_sessions_touch_updated_at
  BEFORE UPDATE ON safety.onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

ALTER TABLE safety.onboarding_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_sessions_tenant_scope ON safety.onboarding_sessions;
CREATE POLICY onboarding_sessions_tenant_scope
  ON safety.onboarding_sessions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.onboarding_sessions TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS safety.onboarding_sessions;
