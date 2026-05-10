BEGIN;

CREATE SCHEMA IF NOT EXISTS factor;

CREATE TABLE IF NOT EXISTS factor.faro_daily_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  statement_date date NOT NULL,
  statement_reference text NOT NULL DEFAULT 'daily',
  source_filename text,
  imported_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  gross_total_cents bigint NOT NULL DEFAULT 0,
  advance_total_cents bigint NOT NULL DEFAULT 0,
  reserve_total_cents bigint NOT NULL DEFAULT 0,
  fee_total_cents bigint NOT NULL DEFAULT 0,
  chargeback_total_cents bigint NOT NULL DEFAULT 0,
  notes text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_faro_daily_imports_scope
  ON factor.faro_daily_imports (operating_company_id, statement_date, statement_reference);
CREATE INDEX IF NOT EXISTS idx_faro_daily_imports_company_recent
  ON factor.faro_daily_imports (operating_company_id, statement_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS factor.faro_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  daily_import_id uuid NOT NULL REFERENCES factor.faro_daily_imports(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text,
  load_id uuid REFERENCES mdata.loads(id),
  gross_amount_cents bigint NOT NULL DEFAULT 0,
  advance_amount_cents bigint NOT NULL DEFAULT 0,
  reserve_amount_cents bigint NOT NULL DEFAULT 0,
  fee_amount_cents bigint NOT NULL DEFAULT 0,
  chargeback_amount_cents bigint NOT NULL DEFAULT 0,
  net_amount_cents bigint NOT NULL DEFAULT 0,
  due_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_faro_invoice_lines_per_import
  ON factor.faro_invoice_lines (daily_import_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_faro_invoice_lines_company_load
  ON factor.faro_invoice_lines (operating_company_id, load_id);
CREATE INDEX IF NOT EXISTS idx_faro_invoice_lines_company_invoice
  ON factor.faro_invoice_lines (operating_company_id, invoice_number);

ALTER TABLE factor.faro_daily_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE factor.faro_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_faro_daily_imports_isolation ON factor.faro_daily_imports;
CREATE POLICY rls_faro_daily_imports_isolation
  ON factor.faro_daily_imports
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_faro_invoice_lines_isolation ON factor.faro_invoice_lines;
CREATE POLICY rls_faro_invoice_lines_isolation
  ON factor.faro_invoice_lines
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

COMMIT;
