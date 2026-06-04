-- P6-T2: IFTA quarterly preparer — schema + Samsara miles source tables
BEGIN;

CREATE SCHEMA IF NOT EXISTS ifta;
CREATE SCHEMA IF NOT EXISTS samsara;

CREATE TABLE IF NOT EXISTS samsara.vehicle_state_miles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NULL REFERENCES mdata.units(id) ON DELETE SET NULL,
  samsara_vehicle_id text NULL,
  state text NOT NULL,
  miles numeric(12, 3) NOT NULL DEFAULT 0 CHECK (miles >= 0),
  period_start date NOT NULL,
  period_end date NOT NULL,
  source text NOT NULL DEFAULT 'samsara',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, unit_id, state, period_start, period_end, source)
);

CREATE INDEX IF NOT EXISTS idx_samsara_vehicle_state_miles_company_period
  ON samsara.vehicle_state_miles (operating_company_id, period_start, period_end, state);

CREATE TABLE IF NOT EXISTS ifta.quarterly_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'miles_aggregated', 'gallons_aggregated', 'tax_calculated', 'csv_generated', 'submitted')),
  miles_aggregated_at timestamptz NULL,
  gallons_aggregated_at timestamptz NULL,
  tax_calculated_at timestamptz NULL,
  csv_generated_at timestamptz NULL,
  csv_url text NULL,
  submitted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, quarter, year)
);

CREATE TABLE IF NOT EXISTS ifta.state_miles_by_quarter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL REFERENCES ifta.quarterly_preparations(id) ON DELETE CASCADE,
  state text NOT NULL,
  miles numeric(12, 3) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'samsara',
  override_miles numeric(12, 3) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preparation_id, state)
);

CREATE TABLE IF NOT EXISTS ifta.state_gallons_by_quarter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL REFERENCES ifta.quarterly_preparations(id) ON DELETE CASCADE,
  state text NOT NULL,
  gallons numeric(12, 3) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'mixed',
  source_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  override_gallons numeric(12, 3) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preparation_id, state)
);

ALTER TABLE samsara.vehicle_state_miles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifta.quarterly_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifta.state_miles_by_quarter ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifta.state_gallons_by_quarter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samsara_vehicle_state_miles_company ON samsara.vehicle_state_miles;
CREATE POLICY samsara_vehicle_state_miles_company ON samsara.vehicle_state_miles
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

DROP POLICY IF EXISTS ifta_quarterly_preparations_company ON ifta.quarterly_preparations;
CREATE POLICY ifta_quarterly_preparations_company ON ifta.quarterly_preparations
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

DROP POLICY IF EXISTS ifta_state_miles_company ON ifta.state_miles_by_quarter;
CREATE POLICY ifta_state_miles_company ON ifta.state_miles_by_quarter
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1 FROM ifta.quarterly_preparations qp
      WHERE qp.id = preparation_id
        AND qp.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1 FROM ifta.quarterly_preparations qp
      WHERE qp.id = preparation_id
        AND qp.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS ifta_state_gallons_company ON ifta.state_gallons_by_quarter;
CREATE POLICY ifta_state_gallons_company ON ifta.state_gallons_by_quarter
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1 FROM ifta.quarterly_preparations qp
      WHERE qp.id = preparation_id
        AND qp.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1 FROM ifta.quarterly_preparations qp
      WHERE qp.id = preparation_id
        AND qp.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  );

GRANT USAGE ON SCHEMA ifta TO ih35_app;
GRANT USAGE ON SCHEMA samsara TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ifta TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA samsara TO ih35_app;

COMMIT;
