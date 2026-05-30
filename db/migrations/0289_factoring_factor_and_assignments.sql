BEGIN;

CREATE SCHEMA IF NOT EXISTS factoring;

CREATE TABLE IF NOT EXISTS factoring.factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  name text NOT NULL,
  advance_rate numeric(5,4) NOT NULL CHECK (advance_rate >= 0 AND advance_rate <= 1),
  fee_rate numeric(5,4) NOT NULL CHECK (fee_rate >= 0 AND fee_rate <= 1),
  reserve_rate numeric(5,4) NOT NULL CHECK (reserve_rate >= 0 AND reserve_rate <= 1),
  recourse_days integer NOT NULL CHECK (recourse_days > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_factoring_factor_tenant_active
  ON factoring.factor (tenant_id, active);

CREATE TABLE IF NOT EXISTS factoring.customer_factor_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  factor_id uuid NOT NULL REFERENCES factoring.factor(id),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_factoring_customer_factor_assignment_lookup
  ON factoring.customer_factor_assignment (tenant_id, customer_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_factoring_customer_factor_assignment_active
  ON factoring.customer_factor_assignment (tenant_id, customer_id)
  WHERE effective_to IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'factoring_batch_factor_id_fk'
  ) THEN
    ALTER TABLE factoring.batch
      ADD CONSTRAINT factoring_batch_factor_id_fk
      FOREIGN KEY (factor_id) REFERENCES factoring.factor(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.factor TO neondb_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.customer_factor_assignment TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE factoring.factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE factoring.factor FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_factor_tenant_scope ON factoring.factor;
CREATE POLICY factoring_factor_tenant_scope
  ON factoring.factor
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.factor TO ih35_app;

ALTER TABLE factoring.customer_factor_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE factoring.customer_factor_assignment FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_customer_factor_assignment_tenant_scope ON factoring.customer_factor_assignment;
CREATE POLICY factoring_customer_factor_assignment_tenant_scope
  ON factoring.customer_factor_assignment
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.customer_factor_assignment TO ih35_app;

COMMIT;
