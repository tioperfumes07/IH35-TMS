BEGIN;

CREATE SCHEMA IF NOT EXISTS factoring;

CREATE TABLE IF NOT EXISTS factoring.bank_match_suggestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  bank_txn_id uuid NOT NULL REFERENCES banking.bank_transactions(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES factoring.batch(id) ON DELETE CASCADE,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_factoring_bank_match_suggestion_tenant_bank_txn
  ON factoring.bank_match_suggestion (tenant_id, bank_txn_id);

CREATE INDEX IF NOT EXISTS idx_factoring_bank_match_suggestion_batch
  ON factoring.bank_match_suggestion (batch_id);

CREATE INDEX IF NOT EXISTS idx_factoring_bank_match_suggestion_applied_at
  ON factoring.bank_match_suggestion (applied_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.bank_match_suggestion TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE factoring.bank_match_suggestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE factoring.bank_match_suggestion FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_bank_match_suggestion_tenant_scope ON factoring.bank_match_suggestion;
CREATE POLICY factoring_bank_match_suggestion_tenant_scope
  ON factoring.bank_match_suggestion
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.bank_match_suggestion TO ih35_app;

COMMIT;
