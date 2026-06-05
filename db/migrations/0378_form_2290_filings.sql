-- P8-COMP-1: Form 2290 HVUT annual filing tracking + per-vehicle rows
BEGIN;

CREATE TABLE IF NOT EXISTS compliance.form_2290_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  tax_period_start date NOT NULL,
  tax_period_end date NOT NULL,
  filing_status text NOT NULL DEFAULT 'draft' CHECK (
    filing_status IN ('draft', 'submitted', 'accepted', 'rejected')
  ),
  total_tax_due numeric(12, 2) NOT NULL DEFAULT 0,
  irs_efile_acceptance_id text NULL,
  filed_at timestamptz NULL,
  pdf_file_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_form_2290_company_period UNIQUE (operating_company_id, tax_period_start, tax_period_end)
);

CREATE TABLE IF NOT EXISTS compliance.form_2290_filing_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES compliance.form_2290_filings(id) ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  vin text NOT NULL,
  gross_weight_lbs integer NOT NULL DEFAULT 80000,
  gross_weight_category text NOT NULL,
  tax_due numeric(12, 2) NOT NULL DEFAULT 0,
  suspension_claimed boolean NOT NULL DEFAULT false,
  first_used_month date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_form_2290_filing_vehicle UNIQUE (filing_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_form_2290_filings_company_period
  ON compliance.form_2290_filings (operating_company_id, tax_period_start DESC);

CREATE INDEX IF NOT EXISTS idx_form_2290_filing_vehicles_company
  ON compliance.form_2290_filing_vehicles (operating_company_id, filing_id);

ALTER TABLE compliance.form_2290_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.form_2290_filing_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_2290_filings_tenant ON compliance.form_2290_filings;
CREATE POLICY form_2290_filings_tenant ON compliance.form_2290_filings
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS form_2290_filing_vehicles_tenant ON compliance.form_2290_filing_vehicles;
CREATE POLICY form_2290_filing_vehicles_tenant ON compliance.form_2290_filing_vehicles
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA compliance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.form_2290_filings TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.form_2290_filing_vehicles TO ih35_app;

COMMIT;
