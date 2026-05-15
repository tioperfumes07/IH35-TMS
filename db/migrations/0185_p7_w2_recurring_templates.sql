-- P7 Wave 2 v3 — accounting.recurring_templates (materialization stubs via cron).

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  kind text NOT NULL CHECK (kind IN ('invoice', 'bill', 'expense', 'journal_entry')),
  cadence text NOT NULL CHECK (
    cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'custom_cron')
  ),
  cron_expression text,
  next_run_at timestamptz NOT NULL,
  template_payload jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  run_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_templates_company_next_run
  ON accounting.recurring_templates (operating_company_id, next_run_at)
  WHERE is_active;

ALTER TABLE accounting.recurring_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.recurring_templates TO ih35_app;

DROP POLICY IF EXISTS recurring_templates_company_scope ON accounting.recurring_templates;
CREATE POLICY recurring_templates_company_scope ON accounting.recurring_templates
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

COMMIT;
