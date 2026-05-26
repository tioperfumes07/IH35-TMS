BEGIN;

CREATE TABLE IF NOT EXISTS safety.drug_pool_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  period TEXT NOT NULL,
  annual_drug_rate NUMERIC(5,4) NOT NULL,
  annual_alcohol_rate NUMERIC(5,4) NOT NULL,
  seed TEXT NOT NULL,
  selected_driver_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.drug_pool_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drug_pool_selections_tenant_scope ON safety.drug_pool_selections;
CREATE POLICY drug_pool_selections_tenant_scope
  ON safety.drug_pool_selections
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.drug_pool_selections TO ih35_app;

COMMIT;
