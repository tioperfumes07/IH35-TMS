BEGIN;

CREATE SCHEMA IF NOT EXISTS insurance;

CREATE TABLE IF NOT EXISTS insurance.policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  insurer_name TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  coverage_type TEXT NOT NULL CHECK (
    coverage_type IN (
      'auto_liability',
      'physical_damage',
      'cargo',
      'general_liability',
      'workers_comp'
    )
  ),
  effective_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  total_premium_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_premium_cents >= 0),
  down_payment_cents BIGINT NOT NULL DEFAULT 0 CHECK (down_payment_cents >= 0),
  installment_count INTEGER NOT NULL DEFAULT 0 CHECK (installment_count >= 0),
  due_day INTEGER NULL CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31)),
  pay_day INTEGER NULL CHECK (pay_day IS NULL OR (pay_day >= 1 AND pay_day <= 31)),
  late_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (late_fee_pct >= 0),
  insurer_email TEXT NULL,
  agent_contact TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('active', 'expired', 'cancelled', 'pending')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date >= effective_date)
);

CREATE TABLE IF NOT EXISTS insurance.policy_unit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  policy_id UUID NOT NULL REFERENCES insurance.policy(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES mdata.assets(id),
  insured_value_cents BIGINT NOT NULL DEFAULT 0 CHECK (insured_value_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_policy_tenant_coverage
  ON insurance.policy (tenant_id, coverage_type);
CREATE INDEX IF NOT EXISTS idx_insurance_policy_tenant_status
  ON insurance.policy (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_insurance_policy_tenant_expiry
  ON insurance.policy (tenant_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_insurance_policy_unit_policy
  ON insurance.policy_unit (policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policy_unit_asset
  ON insurance.policy_unit (asset_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policy_unit_tenant_asset
  ON insurance.policy_unit (tenant_id, asset_id);

ALTER TABLE insurance.policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.policy FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_policy_tenant_scope ON insurance.policy;
CREATE POLICY insurance_policy_tenant_scope
  ON insurance.policy
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

ALTER TABLE insurance.policy_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.policy_unit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_policy_unit_tenant_scope ON insurance.policy_unit;
CREATE POLICY insurance_policy_unit_tenant_scope
  ON insurance.policy_unit
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_insurance_policy_updated_at ON insurance.policy;
CREATE TRIGGER trg_insurance_policy_updated_at
  BEFORE UPDATE ON insurance.policy
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_insurance_policy_unit_updated_at ON insurance.policy_unit;
CREATE TRIGGER trg_insurance_policy_unit_updated_at
  BEFORE UPDATE ON insurance.policy_unit
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT USAGE ON SCHEMA insurance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy_unit TO ih35_app;

COMMIT;
