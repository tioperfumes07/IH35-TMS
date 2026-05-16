-- Daily Tasks module (P0) — internal task lifecycle + append-only events + alert queue.
-- Invariants: additive/idempotent, RLS-scoped, server-generated ids.

BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
GRANT USAGE ON SCHEMA ops TO ih35_app;

CREATE TABLE IF NOT EXISTS ops.daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  title text NOT NULL,
  description text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  assigned_to_user_id uuid NOT NULL REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'accepted', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_daily_tasks_completed_pair
    CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed')),
  CONSTRAINT chk_daily_tasks_accepted_pair
    CHECK ((status IN ('accepted', 'completed') AND accepted_at IS NOT NULL) OR (status NOT IN ('accepted', 'completed')))
);

CREATE INDEX IF NOT EXISTS ix_daily_tasks_company_status_due
  ON ops.daily_tasks (operating_company_id, status, due_at);

CREATE INDEX IF NOT EXISTS ix_daily_tasks_assignee_status
  ON ops.daily_tasks (assigned_to_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_daily_tasks_creator_status
  ON ops.daily_tasks (created_by_user_id, status, created_at DESC);

ALTER TABLE ops.daily_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_tasks_select_scope ON ops.daily_tasks;
CREATE POLICY daily_tasks_select_scope
  ON ops.daily_tasks
  FOR SELECT TO ih35_app
  USING (
    (
      identity.current_user_role() = 'Owner'
      OR EXISTS (
        SELECT 1
        FROM org.user_company_access a
        WHERE a.user_id = identity.current_user_id()
          AND a.company_id = operating_company_id
          AND a.deactivated_at IS NULL
      )
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    AND (
      created_by_user_id = identity.current_user_id()
      OR assigned_to_user_id = identity.current_user_id()
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
  );

DROP POLICY IF EXISTS daily_tasks_insert_scope ON ops.daily_tasks;
CREATE POLICY daily_tasks_insert_scope
  ON ops.daily_tasks
  FOR INSERT TO ih35_app
  WITH CHECK (
    (
      identity.current_user_role() = 'Owner'
      OR EXISTS (
        SELECT 1
        FROM org.user_company_access a
        WHERE a.user_id = identity.current_user_id()
          AND a.company_id = operating_company_id
          AND a.deactivated_at IS NULL
      )
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    AND (created_by_user_id = identity.current_user_id() OR current_setting('app.bypass_rls', true) = 'lucia')
  );

DROP POLICY IF EXISTS daily_tasks_update_scope ON ops.daily_tasks;
CREATE POLICY daily_tasks_update_scope
  ON ops.daily_tasks
  FOR UPDATE TO ih35_app
  USING (
    (
      identity.current_user_role() = 'Owner'
      OR EXISTS (
        SELECT 1
        FROM org.user_company_access a
        WHERE a.user_id = identity.current_user_id()
          AND a.company_id = operating_company_id
          AND a.deactivated_at IS NULL
      )
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    AND (
      created_by_user_id = identity.current_user_id()
      OR assigned_to_user_id = identity.current_user_id()
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
  )
  WITH CHECK (
    identity.current_user_role() = 'Owner'
    OR EXISTS (
      SELECT 1
      FROM org.user_company_access a
      WHERE a.user_id = identity.current_user_id()
        AND a.company_id = operating_company_id
        AND a.deactivated_at IS NULL
    )
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON ops.daily_tasks TO ih35_app;

CREATE TABLE IF NOT EXISTS ops.daily_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  daily_task_id uuid NOT NULL REFERENCES ops.daily_tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'accepted', 'completed', 'cancelled', 'reassigned', 'comment')),
  actor_user_id uuid NOT NULL REFERENCES identity.users(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_daily_task_events_task_created
  ON ops.daily_task_events (daily_task_id, created_at ASC);

ALTER TABLE ops.daily_task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_task_events_select_scope ON ops.daily_task_events;
CREATE POLICY daily_task_events_select_scope
  ON ops.daily_task_events
  FOR SELECT TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM ops.daily_tasks t
      WHERE t.id = daily_task_id
        AND t.operating_company_id = ops.daily_task_events.operating_company_id
        AND (
          t.created_by_user_id = identity.current_user_id()
          OR t.assigned_to_user_id = identity.current_user_id()
          OR identity.current_user_role() = 'Owner'
          OR current_setting('app.bypass_rls', true) = 'lucia'
        )
        AND (
          identity.current_user_role() = 'Owner'
          OR EXISTS (
            SELECT 1
            FROM org.user_company_access a
            WHERE a.user_id = identity.current_user_id()
              AND a.company_id = t.operating_company_id
              AND a.deactivated_at IS NULL
          )
          OR current_setting('app.bypass_rls', true) = 'lucia'
        )
    )
  );

DROP POLICY IF EXISTS daily_task_events_insert_scope ON ops.daily_task_events;
CREATE POLICY daily_task_events_insert_scope
  ON ops.daily_task_events
  FOR INSERT TO ih35_app
  WITH CHECK (
    (
      identity.current_user_role() = 'Owner'
      OR EXISTS (
        SELECT 1
        FROM org.user_company_access a
        WHERE a.user_id = identity.current_user_id()
          AND a.company_id = operating_company_id
          AND a.deactivated_at IS NULL
      )
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    AND (actor_user_id = identity.current_user_id() OR current_setting('app.bypass_rls', true) = 'lucia')
  );

-- Append-only events.
REVOKE UPDATE, DELETE ON ops.daily_task_events FROM ih35_app;
GRANT SELECT, INSERT ON ops.daily_task_events TO ih35_app;

CREATE TABLE IF NOT EXISTS ops.daily_task_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  daily_task_id uuid NOT NULL REFERENCES ops.daily_tasks(id) ON DELETE CASCADE,
  alert_type text NOT NULL
    CHECK (alert_type IN ('assigned', 'nearing_due', 'overdue', 'completed')),
  target_user_id uuid NOT NULL REFERENCES identity.users(id),
  channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'sms', 'whatsapp', 'in_app')),
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_task_alert_once
  ON ops.daily_task_alerts (daily_task_id, alert_type, target_user_id, channel);

CREATE INDEX IF NOT EXISTS ix_daily_task_alerts_delivery
  ON ops.daily_task_alerts (operating_company_id, alert_type, delivered_at, enqueued_at DESC);

ALTER TABLE ops.daily_task_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_task_alerts_select_scope ON ops.daily_task_alerts;
CREATE POLICY daily_task_alerts_select_scope
  ON ops.daily_task_alerts
  FOR SELECT TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    AND (target_user_id = identity.current_user_id() OR identity.current_user_role() = 'Owner' OR current_setting('app.bypass_rls', true) = 'lucia')
  );

DROP POLICY IF EXISTS daily_task_alerts_insert_scope ON ops.daily_task_alerts;
CREATE POLICY daily_task_alerts_insert_scope
  ON ops.daily_task_alerts
  FOR INSERT TO ih35_app
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_id() IS NOT NULL
    )
  );

DROP POLICY IF EXISTS daily_task_alerts_update_scope ON ops.daily_task_alerts;
CREATE POLICY daily_task_alerts_update_scope
  ON ops.daily_task_alerts
  FOR UPDATE TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON ops.daily_task_alerts TO ih35_app;

-- Security-invoker helper view (derived overdue; never persisted as status).
CREATE OR REPLACE VIEW ops.v_daily_tasks_overdue
WITH (security_invoker = true) AS
SELECT
  t.*,
  (t.due_at IS NOT NULL AND t.due_at < now() AND t.status NOT IN ('completed', 'cancelled')) AS is_overdue
FROM ops.daily_tasks t;

GRANT SELECT ON ops.v_daily_tasks_overdue TO ih35_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_daily_tasks ON ops.daily_tasks;
      CREATE TRIGGER tg_audit_daily_tasks
        AFTER INSERT OR UPDATE OR DELETE ON ops.daily_tasks
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

COMMIT;
