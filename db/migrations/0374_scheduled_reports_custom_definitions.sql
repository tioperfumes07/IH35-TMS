-- P6-T4: custom report definitions + scheduled report send-time columns
BEGIN;

ALTER TABLE reports.scheduled_reports
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS send_at_local_time time DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE reports.scheduled_reports
SET send_at_local_time = CASE report_id
  WHEN 'dispatch-board' THEN '07:00:00'::time
  WHEN 'cash-position-ar' THEN '18:00:00'::time
  WHEN 'profit-per-truck-week' THEN '08:00:00'::time
  WHEN 'settlements-ready' THEN '17:00:00'::time
  WHEN 'maintenance-open-wos' THEN '08:00:00'::time
  WHEN 'ifta-quarterly-state' THEN '08:00:00'::time
  ELSE COALESCE(send_at_local_time, '07:00:00'::time)
END
WHERE send_at_local_time IS NULL OR send_at_local_time = '07:00:00'::time;

UPDATE reports.scheduled_reports
SET next_due_at = (date_trunc('day', now() AT TIME ZONE 'America/Chicago') + send_at_local_time) AT TIME ZONE 'America/Chicago'
WHERE next_due_at IS NULL AND enabled = true;

CREATE TABLE IF NOT EXISTS reports.custom_report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  owner_user_id uuid NOT NULL REFERENCES identity.users(id),
  name text NOT NULL,
  base_view text NOT NULL DEFAULT 'run_log',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  group_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_report_defs_company
  ON reports.custom_report_definitions(operating_company_id, owner_user_id);

ALTER TABLE reports.custom_report_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_report_defs_company ON reports.custom_report_definitions;
CREATE POLICY custom_report_defs_company ON reports.custom_report_definitions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP TRIGGER IF EXISTS trg_custom_report_defs_updated_at ON reports.custom_report_definitions;
CREATE TRIGGER trg_custom_report_defs_updated_at
  BEFORE UPDATE ON reports.custom_report_definitions
  FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON reports.custom_report_definitions TO ih35_app;

COMMIT;
