-- GAP-42: IFTA quarterly filing drafts (reports.ifta_filings) + owner approval lifecycle
BEGIN;

CREATE SCHEMA IF NOT EXISTS reports;

CREATE TABLE IF NOT EXISTS reports.ifta_filings (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  quarter text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'review', 'owner_approved', 'filed')),
  filing_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_by_user_uuid uuid NOT NULL REFERENCES identity.users(id),
  approved_by_user_uuid uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  filed_at timestamptz,
  confirmation_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_ifta_filings_company_quarter
  ON reports.ifta_filings (operating_company_id, quarter DESC);

ALTER TABLE reports.ifta_filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ifta_filings_company_scope ON reports.ifta_filings;
CREATE POLICY ifta_filings_company_scope ON reports.ifta_filings
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON reports.ifta_filings TO ih35_app;

COMMIT;
