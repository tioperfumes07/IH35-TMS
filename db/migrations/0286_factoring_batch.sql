BEGIN;

CREATE SCHEMA IF NOT EXISTS factoring;

CREATE TABLE IF NOT EXISTS factoring.batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  batch_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'funded', 'rejected')),
  invoice_ids uuid[] NOT NULL,
  total_face_cents bigint NOT NULL CHECK (total_face_cents >= 0),
  advance_rate numeric(5,4) NOT NULL DEFAULT 0.95
    CHECK (advance_rate >= 0 AND advance_rate <= 1),
  expected_advance_cents bigint NOT NULL CHECK (expected_advance_cents >= 0),
  fee_rate numeric(5,4) NOT NULL DEFAULT 0.025
    CHECK (fee_rate >= 0 AND fee_rate <= 1),
  expected_fee_cents bigint NOT NULL CHECK (expected_fee_cents >= 0),
  submitted_at timestamptz,
  funded_at timestamptz,
  factor_id uuid,
  UNIQUE (tenant_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_factoring_batch_tenant_status
  ON factoring.batch (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_factoring_batch_tenant_batch_number
  ON factoring.batch (tenant_id, batch_number);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.batch TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE factoring.batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE factoring.batch FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_batch_tenant_scope ON factoring.batch;
CREATE POLICY factoring_batch_tenant_scope
  ON factoring.batch
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.batch TO ih35_app;

COMMIT;
