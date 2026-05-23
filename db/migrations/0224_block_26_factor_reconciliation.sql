BEGIN;

CREATE SCHEMA IF NOT EXISTS factor;

CREATE TABLE IF NOT EXISTS factor.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  factor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  statement_date date NOT NULL,
  source_daily_import_id uuid REFERENCES factor.faro_daily_imports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total_advances_cents bigint NOT NULL DEFAULT 0 CHECK (total_advances_cents >= 0),
  total_fees_cents bigint NOT NULL DEFAULT 0 CHECK (total_fees_cents >= 0),
  total_reserves_released_cents bigint NOT NULL DEFAULT 0 CHECK (total_reserves_released_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_uuid uuid REFERENCES identity.users(id),
  closed_at timestamptz,
  closed_by_user_uuid uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_factor_reconciliation_runs_company_date
  ON factor.reconciliation_runs (operating_company_id, statement_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_factor_reconciliation_runs_factor
  ON factor.reconciliation_runs (factor_id, statement_date DESC);

CREATE TABLE IF NOT EXISTS factor.reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES factor.reconciliation_runs(id) ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  invoice_id uuid REFERENCES accounting.invoices(id) ON DELETE SET NULL,
  statement_invoice_number text,
  ledger_match_state text NOT NULL CHECK (
    ledger_match_state IN ('matched', 'missing_in_ledger', 'missing_on_statement', 'amount_mismatch')
  ),
  factor_amount_cents bigint NOT NULL DEFAULT 0,
  ledger_amount_cents bigint NOT NULL DEFAULT 0,
  variance_cents bigint NOT NULL DEFAULT 0,
  tolerance_cents bigint NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factor_reconciliation_items_run
  ON factor.reconciliation_items (run_id, ledger_match_state);

CREATE INDEX IF NOT EXISTS idx_factor_reconciliation_items_company_invoice
  ON factor.reconciliation_items (operating_company_id, invoice_id);

ALTER TABLE factor.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE factor.reconciliation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_factor_reconciliation_runs_isolation ON factor.reconciliation_runs;
CREATE POLICY rls_factor_reconciliation_runs_isolation
  ON factor.reconciliation_runs
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_factor_reconciliation_items_isolation ON factor.reconciliation_items;
CREATE POLICY rls_factor_reconciliation_items_isolation
  ON factor.reconciliation_items
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON factor.reconciliation_runs TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON factor.reconciliation_items TO ih35_app;

COMMIT;
