BEGIN;

CREATE SCHEMA IF NOT EXISTS compliance;
GRANT USAGE ON SCHEMA compliance TO ih35_app;

CREATE TABLE IF NOT EXISTS compliance.form_425c_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reporting_month date NOT NULL,
  case_number text NOT NULL,
  court_district text NOT NULL,
  subchapter text NOT NULL CHECK (subchapter IN ('V', 'standard')),
  petition_date date NOT NULL,
  part1_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  part2_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_19_opening_cash numeric(12,2),
  line_20_receipts numeric(12,2),
  line_21_disbursements numeric(12,2),
  line_22_net_cash_flow numeric(12,2),
  line_23_ending_cash numeric(12,2),
  banking_imported_at timestamptz,
  banking_imported_by_user_id uuid REFERENCES identity.users(id),
  line_24_payables numeric(12,2),
  line_25_receivables numeric(12,2),
  line_26_employees_at_filing int,
  line_27_employees_now int,
  line_28_bk_fees_this_month numeric(12,2),
  line_29_bk_fees_since_filing numeric(12,2),
  line_30_other_fees_this_month numeric(12,2),
  line_31_other_fees_since_filing numeric(12,2),
  line_32_proj_receipts numeric(12,2),
  line_33_proj_disbursements numeric(12,2),
  line_34_proj_net_cash_flow numeric(12,2),
  line_35_next_proj_receipts numeric(12,2),
  line_36_next_proj_disbursements numeric(12,2),
  line_37_next_proj_net_cash_flow numeric(12,2),
  attachment_38_bank_statements_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_39_recon_reports_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_40_financial_reports_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_41_budget_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_42_job_costing_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL CHECK (status IN ('draft', 'ready_to_file', 'filed', 'amended')) DEFAULT 'draft',
  filed_pdf_uuid uuid REFERENCES docs.files(id),
  filed_at timestamptz,
  filed_by_user_id uuid REFERENCES identity.users(id),
  amended_from_uuid uuid REFERENCES compliance.form_425c_reports(id),
  carry_forward_source_report_id uuid REFERENCES compliance.form_425c_reports(id),
  projection_override_reason text,
  projection_override_by_user_id uuid REFERENCES identity.users(id),
  projection_override_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reporting_month, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_form_425c_reports_company_month
  ON compliance.form_425c_reports (operating_company_id, reporting_month DESC);
CREATE INDEX IF NOT EXISTS idx_form_425c_reports_status
  ON compliance.form_425c_reports (operating_company_id, status, reporting_month DESC);
CREATE INDEX IF NOT EXISTS idx_form_425c_reports_amended_from
  ON compliance.form_425c_reports (amended_from_uuid)
  WHERE amended_from_uuid IS NOT NULL;

CREATE TABLE IF NOT EXISTS compliance.form_425c_exhibit_a_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES compliance.form_425c_reports(id) ON DELETE CASCADE,
  line_number int NOT NULL CHECK (line_number BETWEEN 1 AND 9),
  explanation text NOT NULL CHECK (length(trim(explanation)) >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_425c_exhibit_a_report
  ON compliance.form_425c_exhibit_a_entries (report_id, line_number, created_at DESC);

CREATE TABLE IF NOT EXISTS compliance.form_425c_exhibit_b_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES compliance.form_425c_reports(id) ON DELETE CASCADE,
  line_number int NOT NULL CHECK (line_number BETWEEN 10 AND 18),
  explanation text NOT NULL CHECK (length(trim(explanation)) >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_425c_exhibit_b_report
  ON compliance.form_425c_exhibit_b_entries (report_id, line_number, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON compliance.form_425c_reports TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON compliance.form_425c_exhibit_a_entries TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON compliance.form_425c_exhibit_b_entries TO ih35_app;

ALTER TABLE compliance.form_425c_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.form_425c_exhibit_a_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.form_425c_exhibit_b_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_form_425c ON compliance.form_425c_reports;
CREATE POLICY rls_form_425c ON compliance.form_425c_reports
  FOR ALL TO ih35_app
  USING (operating_company_id = current_setting('app.operating_company_id')::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id')::uuid);

DROP POLICY IF EXISTS rls_form_425c_exhibit_a ON compliance.form_425c_exhibit_a_entries;
CREATE POLICY rls_form_425c_exhibit_a ON compliance.form_425c_exhibit_a_entries
  FOR ALL TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM compliance.form_425c_reports r
      WHERE r.id = compliance.form_425c_exhibit_a_entries.report_id
        AND r.operating_company_id = current_setting('app.operating_company_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM compliance.form_425c_reports r
      WHERE r.id = compliance.form_425c_exhibit_a_entries.report_id
        AND r.operating_company_id = current_setting('app.operating_company_id')::uuid
    )
  );

DROP POLICY IF EXISTS rls_form_425c_exhibit_b ON compliance.form_425c_exhibit_b_entries;
CREATE POLICY rls_form_425c_exhibit_b ON compliance.form_425c_exhibit_b_entries
  FOR ALL TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM compliance.form_425c_reports r
      WHERE r.id = compliance.form_425c_exhibit_b_entries.report_id
        AND r.operating_company_id = current_setting('app.operating_company_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM compliance.form_425c_reports r
      WHERE r.id = compliance.form_425c_exhibit_b_entries.report_id
        AND r.operating_company_id = current_setting('app.operating_company_id')::uuid
    )
  );

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class, severity_default)
    VALUES
      ('compliance.form_425c.created', 'info'),
      ('compliance.form_425c.draft_saved', 'info'),
      ('compliance.form_425c.banking_imported', 'info'),
      ('compliance.form_425c.pdf_generated', 'info'),
      ('compliance.form_425c.filed', 'info'),
      ('compliance.form_425c.amended', 'info')
    ON CONFLICT (event_class) DO NOTHING;
  END IF;
END
$$;

COMMIT;
