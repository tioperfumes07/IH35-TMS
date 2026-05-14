-- P6-T11201 — Scheduled reports (reporting schema) + run history (additive, INVARIANT #24).
-- qbo.sync_alerts already includes acknowledged_at / acknowledged_by_user_id (0144) — no ALTER here.

BEGIN;

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE TABLE IF NOT EXISTS reporting.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  report_id TEXT NOT NULL,
  report_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','cron')),
  cron_expression TEXT,
  run_time TIME,
  run_day_of_week INTEGER CHECK (run_day_of_week IS NULL OR (run_day_of_week >= 0 AND run_day_of_week <= 6)),
  run_day_of_month INTEGER CHECK (run_day_of_month IS NULL OR (run_day_of_month >= 1 AND run_day_of_month <= 31)),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  recipients_to TEXT[] NOT NULL,
  recipients_cc TEXT[],
  recipients_bcc TEXT[],
  subject_template TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf','xlsx','csv')) DEFAULT 'pdf',
  status TEXT NOT NULL CHECK (status IN ('active','paused','failed','draft')) DEFAULT 'active',
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IS NULL OR last_run_status IN ('success','failed','retrying')),
  last_run_error TEXT,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_scheduled_reports_company_status
  ON reporting.scheduled_reports(operating_company_id, status);

CREATE INDEX IF NOT EXISTS ix_scheduled_reports_next_run
  ON reporting.scheduled_reports(next_run_at)
  WHERE status = 'active';

ALTER TABLE reporting.scheduled_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_reports_company_scope ON reporting.scheduled_reports;
CREATE POLICY scheduled_reports_company_scope
  ON reporting.scheduled_reports
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP TRIGGER IF EXISTS trg_scheduled_reports_updated_at ON reporting.scheduled_reports;
CREATE TRIGGER trg_scheduled_reports_updated_at
  BEFORE UPDATE ON reporting.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

CREATE TABLE IF NOT EXISTS reporting.scheduled_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  scheduled_report_id UUID NOT NULL REFERENCES reporting.scheduled_reports(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success','failed')),
  duration_ms INTEGER,
  generated_file_r2_path TEXT,
  file_size_bytes BIGINT,
  email_queue_id UUID REFERENCES email.email_queue(id),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_scheduled_report_runs_scheduled_id
  ON reporting.scheduled_report_runs(scheduled_report_id, run_at DESC);

ALTER TABLE reporting.scheduled_report_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_report_runs_company_scope ON reporting.scheduled_report_runs;
CREATE POLICY scheduled_report_runs_company_scope
  ON reporting.scheduled_report_runs
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA reporting TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON reporting.scheduled_reports TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON reporting.scheduled_report_runs TO ih35_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_scheduled_reports ON reporting.scheduled_reports;
      CREATE TRIGGER tg_audit_scheduled_reports
      AFTER INSERT OR UPDATE OR DELETE ON reporting.scheduled_reports
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;

    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_scheduled_report_runs ON reporting.scheduled_report_runs;
      CREATE TRIGGER tg_audit_scheduled_report_runs
      AFTER INSERT OR UPDATE OR DELETE ON reporting.scheduled_report_runs
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

COMMIT;
