BEGIN;

-- Block B28: PM auto-WO engine — hourly evaluation audit + per-action log + company pause.

CREATE TABLE IF NOT EXISTS maintenance.pm_schedule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  schedules_evaluated integer NOT NULL DEFAULT 0 CHECK (schedules_evaluated >= 0),
  work_orders_created integer NOT NULL DEFAULT 0 CHECK (work_orders_created >= 0),
  alerts_created integer NOT NULL DEFAULT 0 CHECK (alerts_created >= 0),
  trigger_source text NOT NULL DEFAULT 'cron' CHECK (trigger_source IN ('cron', 'manual')),
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_schedule_runs_company_started
  ON maintenance.pm_schedule_runs (operating_company_id, started_at DESC);

CREATE TABLE IF NOT EXISTS maintenance.pm_auto_wo_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NULL REFERENCES maintenance.pm_schedule_runs(id) ON DELETE SET NULL,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  pm_schedule_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  action text NOT NULL CHECK (
    action IN ('wo_created', 'alert_created', 'near_due_alert', 'skipped_paused', 'skipped_open_wo', 'skipped_no_odometer')
  ),
  work_order_id uuid NULL,
  pm_alert_id uuid NULL,
  detail jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('maintenance.pm_schedules') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_pm_auto_wo_log_schedule'
         AND conrelid = 'maintenance.pm_auto_wo_log'::regclass
     ) THEN
    ALTER TABLE maintenance.pm_auto_wo_log
      ADD CONSTRAINT fk_pm_auto_wo_log_schedule
      FOREIGN KEY (pm_schedule_id) REFERENCES maintenance.pm_schedules(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_pm_auto_wo_log_work_order'
         AND conrelid = 'maintenance.pm_auto_wo_log'::regclass
     ) THEN
    ALTER TABLE maintenance.pm_auto_wo_log
      ADD CONSTRAINT fk_pm_auto_wo_log_work_order
      FOREIGN KEY (work_order_id) REFERENCES maintenance.work_orders(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_pm_auto_wo_log_company_created
  ON maintenance.pm_auto_wo_log (operating_company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pm_auto_wo_log_run
  ON maintenance.pm_auto_wo_log (run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance.pm_auto_engine_settings (
  operating_company_id uuid PRIMARY KEY REFERENCES org.companies(id),
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz NULL,
  paused_by_user_uuid uuid NULL REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE maintenance.pm_schedule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.pm_auto_wo_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.pm_auto_engine_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_schedule_runs_company_scope ON maintenance.pm_schedule_runs;
CREATE POLICY pm_schedule_runs_company_scope
  ON maintenance.pm_schedule_runs
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS pm_auto_wo_log_company_scope ON maintenance.pm_auto_wo_log;
CREATE POLICY pm_auto_wo_log_company_scope
  ON maintenance.pm_auto_wo_log
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS pm_auto_engine_settings_company_scope ON maintenance.pm_auto_engine_settings;
CREATE POLICY pm_auto_engine_settings_company_scope
  ON maintenance.pm_auto_engine_settings
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.pm_schedule_runs TO ih35_app;
GRANT SELECT, INSERT ON maintenance.pm_auto_wo_log TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.pm_auto_engine_settings TO ih35_app;

COMMIT;
