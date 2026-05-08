BEGIN;

CREATE SCHEMA IF NOT EXISTS reports;

CREATE TABLE IF NOT EXISTS reports.run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  report_id text NOT NULL,
  report_name text NOT NULL,
  user_id uuid NOT NULL REFERENCES identity.users(id),
  user_role text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  duration_ms int,
  rows_returned int,
  run_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_log_recent ON reports.run_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_log_report ON reports.run_log(report_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_log_company ON reports.run_log(operating_company_id);

CREATE TABLE IF NOT EXISTS reports.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  report_id text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','quarterly')),
  cadence_detail text,
  recipient_roles text[] NOT NULL DEFAULT '{}',
  recipient_emails text[] NOT NULL DEFAULT '{}',
  last_sent_at timestamptz,
  next_due_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_company ON reports.scheduled_reports(operating_company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON reports.scheduled_reports(next_due_at) WHERE enabled = true;

INSERT INTO reports.scheduled_reports
  (operating_company_id, report_id, cadence, cadence_detail, recipient_roles)
SELECT c.id, r.report_id, r.cadence, r.cadence_detail, r.recipient_roles
FROM org.companies c, (VALUES
  ('dispatch-board',        'daily',     'Mon-Sun 7:00am',      ARRAY['Owner']::text[]),
  ('cash-position-ar',      'daily',     'Mon-Sun 6:00pm',      ARRAY['Owner','Accountant']::text[]),
  ('profit-per-truck-week', 'weekly',    'Mon 8:00am',          ARRAY['Owner']::text[]),
  ('settlements-ready',     'weekly',    'Fri 5:00pm',          ARRAY['Accountant']::text[]),
  ('maintenance-open-wos',  'weekly',    'Mon 8:00am',          ARRAY['Safety']::text[]),
  ('ifta-quarterly-state',  'quarterly', 'last day of quarter', ARRAY['Safety']::text[])
) AS r(report_id, cadence, cadence_detail, recipient_roles)
ON CONFLICT DO NOTHING;

ALTER TABLE reports.run_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports.scheduled_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS run_log_company_scope ON reports.run_log;
CREATE POLICY run_log_company_scope ON reports.run_log
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS scheduled_company_scope ON reports.scheduled_reports;
CREATE POLICY scheduled_company_scope ON reports.scheduled_reports
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT ON reports.run_log TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON reports.scheduled_reports TO ih35_app;

COMMIT;
