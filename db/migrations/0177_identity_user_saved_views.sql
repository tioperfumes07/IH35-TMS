-- Block M — saved list views (filters/sort/columns) per user.

BEGIN;

CREATE TABLE IF NOT EXISTS identity.user_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  name TEXT NOT NULL,
  view_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_saved_views UNIQUE (user_id, table_name, name)
);

CREATE INDEX IF NOT EXISTS ix_user_saved_views_user_table ON identity.user_saved_views (user_id, table_name);

ALTER TABLE identity.user_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_saved_views_scope ON identity.user_saved_views;
CREATE POLICY user_saved_views_scope
  ON identity.user_saved_views
  FOR ALL TO ih35_app
  USING (
    user_id::text = current_setting('app.user_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    user_id::text = current_setting('app.user_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP TRIGGER IF EXISTS trg_user_saved_views_updated_at ON identity.user_saved_views;
CREATE TRIGGER trg_user_saved_views_updated_at
  BEFORE UPDATE ON identity.user_saved_views
  FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_saved_views TO ih35_app;

COMMIT;
