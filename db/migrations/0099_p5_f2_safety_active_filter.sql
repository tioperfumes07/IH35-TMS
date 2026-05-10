BEGIN;

CREATE TABLE IF NOT EXISTS identity.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  dispatch_default_view text NOT NULL DEFAULT 'home',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE identity.user_preferences
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE identity.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_user_prefs_self ON identity.user_preferences;
CREATE POLICY rls_user_prefs_self
  ON identity.user_preferences
  FOR ALL TO ih35_app
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE VIEW safety.v_safety_events_with_active
WITH (security_invoker = true) AS
SELECT
  e.*,
  (
    COALESCE(e.status::text IN ('closed', 'resolved', 'voided'), false) = false
    OR EXISTS (
      SELECT 1
      FROM safety.fines f
      WHERE f.operating_company_id = e.operating_company_id
        AND f.subject_type = 'driver'
        AND f.subject_driver_id = e.driver_id
        AND f.status IN ('open', 'under_review')
    )
  ) AS is_active
FROM views.safety_events_with_driver e;

COMMIT;
