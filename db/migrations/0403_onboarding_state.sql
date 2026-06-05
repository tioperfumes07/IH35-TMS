-- CLOSURE-24 — operator onboarding state + sample-data flags (additive).
BEGIN;

CREATE SCHEMA IF NOT EXISTS onboarding;
GRANT USAGE ON SCHEMA onboarding TO ih35_app;

CREATE TABLE IF NOT EXISTS onboarding.onboarding_state (
  company_id uuid PRIMARY KEY REFERENCES org.companies(id) ON DELETE CASCADE,
  current_step text NOT NULL DEFAULT 'company' CHECK (
    current_step IN ('company', 'qbo', 'samsara', 'plaid', 'team', 'samples', 'complete')
  ),
  step_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  skipped_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_onboarding_state_current_step
  ON onboarding.onboarding_state (current_step);

ALTER TABLE onboarding.onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_state_tenant_scope ON onboarding.onboarding_state;
CREATE POLICY onboarding_state_tenant_scope ON onboarding.onboarding_state
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE ON onboarding.onboarding_state TO ih35_app;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_mdata_customers_sample_data
  ON mdata.customers (operating_company_id, is_sample_data);

CREATE INDEX IF NOT EXISTS ix_mdata_vendors_sample_data
  ON mdata.vendors (operating_company_id, is_sample_data);

CREATE INDEX IF NOT EXISTS ix_mdata_drivers_sample_data
  ON mdata.drivers (operating_company_id, is_sample_data);

CREATE INDEX IF NOT EXISTS ix_mdata_units_sample_data
  ON mdata.units (owner_company_id, is_sample_data);

CREATE INDEX IF NOT EXISTS ix_mdata_loads_sample_data
  ON mdata.loads (operating_company_id, is_sample_data);

COMMIT;
