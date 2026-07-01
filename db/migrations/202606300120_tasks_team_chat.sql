-- TASK-3 "Team Chat" (option a — task-scoped collaboration inside the Tasks module).
-- NON-FINANCIAL. Additive-only: does NOT touch tasks.task / tasks.note / tasks.status_history.
--
-- Adds two append-only, per-entity tables that power threaded comments + @mentions + a per-task
-- activity feed:
--   tasks.task_comments  — one threaded comment per row, with @mention user ids and soft-delete.
--   tasks.task_activity  — unified per-task event feed (comment | status_change | assignment).
--
-- Both are operating_company scoped (matching tasks.task.operating_company_id) with ENABLE+FORCE RLS
-- using the canonical entity-isolation policy (identity.is_lucia_bypass() OR opco::text = the GUC).
-- The tasks routes set app.operating_company_id (SET_TASK_SCOPE_SQL), so the policy resolves per request.
--
-- NOTE: tasks.note (2026-06 W1B) already stores plain comments but has no @mentions, no soft-delete,
-- and no unified activity feed. These new tables are additive and independent (tasks.note untouched).

BEGIN;

-- ── Threaded comments (append-only; soft-delete via deleted_at) ───────────────────────────────
CREATE TABLE IF NOT EXISTS tasks.task_comments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  task_id               uuid NOT NULL REFERENCES tasks.task(task_id),
  author_user_id        uuid NOT NULL,
  body                  text NOT NULL,
  mentions              uuid[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON tasks.task_comments (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_comments_company
  ON tasks.task_comments (operating_company_id, task_id);

-- ── Per-task activity feed (append-only; comment | status_change | assignment) ────────────────
CREATE TABLE IF NOT EXISTS tasks.task_activity (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  task_id               uuid NOT NULL REFERENCES tasks.task(task_id),
  actor_user_id         uuid,
  event_type            text NOT NULL CHECK (event_type IN ('comment', 'status_change', 'assignment')),
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task
  ON tasks.task_activity (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_activity_company
  ON tasks.task_activity (operating_company_id, task_id);

-- ── RLS: ENABLE + FORCE with canonical entity-isolation policy ────────────────────────────────
ALTER TABLE tasks.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks.task_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks.task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks.task_activity FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_comments_company_isolation ON tasks.task_comments;
CREATE POLICY task_comments_company_isolation ON tasks.task_comments
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS task_activity_company_isolation ON tasks.task_activity;
CREATE POLICY task_activity_company_isolation ON tasks.task_activity
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

-- ── Grants (new tables are not covered by the one-time W1B grant-all) ──────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks.task_comments TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks.task_activity TO ih35_app;

COMMENT ON TABLE tasks.task_comments IS 'TASK-3 team chat: threaded comments per task with @mention user ids + soft-delete. Append-only.';
COMMENT ON TABLE tasks.task_activity IS 'TASK-3 team chat: unified per-task activity feed (comment|status_change|assignment). Append-only.';

COMMIT;
