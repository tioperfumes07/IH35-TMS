-- P6-T3: IFTA quarterly preparer — per-state tax calculations
BEGIN;

CREATE TABLE IF NOT EXISTS ifta.state_tax_by_quarter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL REFERENCES ifta.quarterly_preparations(id) ON DELETE CASCADE,
  state text NOT NULL,
  miles_in_state numeric(12, 3) NOT NULL DEFAULT 0,
  taxable_gallons numeric(12, 3) NOT NULL DEFAULT 0,
  gallons_purchased_in_state numeric(12, 3) NOT NULL DEFAULT 0,
  net_taxable_gallons numeric(12, 3) NOT NULL DEFAULT 0,
  tax_rate_per_gallon numeric(8, 4) NOT NULL DEFAULT 0,
  tax_owed numeric(14, 2) NOT NULL DEFAULT 0,
  mpg_in_state numeric(8, 3) NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preparation_id, state)
);

CREATE INDEX IF NOT EXISTS idx_ifta_state_tax_preparation
  ON ifta.state_tax_by_quarter (preparation_id, state);

ALTER TABLE ifta.state_tax_by_quarter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ifta_state_tax_company ON ifta.state_tax_by_quarter;
CREATE POLICY ifta_state_tax_company ON ifta.state_tax_by_quarter
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

GRANT SELECT, INSERT, UPDATE, DELETE ON ifta.state_tax_by_quarter TO ih35_app;

COMMIT;
