BEGIN;

CREATE SCHEMA IF NOT EXISTS insurance;

CREATE TABLE IF NOT EXISTS insurance.claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  claim_number TEXT NOT NULL,
  policy_id UUID NOT NULL REFERENCES insurance.policy(id) ON DELETE CASCADE,
  asset_id UUID NULL REFERENCES mdata.assets(id) ON DELETE SET NULL,
  accident_date DATE NOT NULL,
  reported_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'investigating', 'approved', 'denied', 'paid', 'closed')
  ),
  amount_claimed_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_claimed_cents >= 0),
  amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  adjuster_name TEXT NULL,
  adjuster_email TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);

CREATE TABLE IF NOT EXISTS insurance.lawsuit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  case_number TEXT NOT NULL,
  plaintiff TEXT NOT NULL,
  defendant TEXT NOT NULL,
  court_name TEXT NOT NULL,
  filed_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'filed' CHECK (
    status IN ('filed', 'active', 'settled', 'dismissed', 'judgment')
  ),
  claim_id UUID NULL REFERENCES insurance.claim(id) ON DELETE SET NULL,
  demand_cents BIGINT NOT NULL DEFAULT 0 CHECK (demand_cents >= 0),
  settlement_cents BIGINT NOT NULL DEFAULT 0 CHECK (settlement_cents >= 0),
  attorney_name TEXT NULL,
  attorney_email TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_insurance_claim_tenant_status
  ON insurance.claim (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_policy
  ON insurance.claim (policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_asset
  ON insurance.claim (asset_id);

CREATE INDEX IF NOT EXISTS idx_insurance_lawsuit_tenant_status
  ON insurance.lawsuit (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_insurance_lawsuit_claim
  ON insurance.lawsuit (claim_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.claim TO neondb_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.lawsuit TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE insurance.claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.claim FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_claim_tenant_scope ON insurance.claim;
CREATE POLICY insurance_claim_tenant_scope
  ON insurance.claim
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

ALTER TABLE insurance.lawsuit ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.lawsuit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_lawsuit_tenant_scope ON insurance.lawsuit;
CREATE POLICY insurance_lawsuit_tenant_scope
  ON insurance.lawsuit
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA insurance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.claim TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.lawsuit TO ih35_app;

COMMIT;
