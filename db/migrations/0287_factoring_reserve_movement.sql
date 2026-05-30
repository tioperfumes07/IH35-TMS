BEGIN;

CREATE SCHEMA IF NOT EXISTS factoring;

CREATE TABLE IF NOT EXISTS factoring.reserve_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  batch_id uuid REFERENCES factoring.batch(id) ON DELETE SET NULL,
  factor_id uuid,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factoring_reserve_movement_tenant_created
  ON factoring.reserve_movement (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_factoring_reserve_movement_batch
  ON factoring.reserve_movement (batch_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.reserve_movement TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE factoring.reserve_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE factoring.reserve_movement FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_reserve_movement_tenant_scope ON factoring.reserve_movement;
CREATE POLICY factoring_reserve_movement_tenant_scope
  ON factoring.reserve_movement
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.reserve_movement TO ih35_app;

COMMIT;
