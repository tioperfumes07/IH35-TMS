BEGIN;

CREATE SCHEMA IF NOT EXISTS banking;

CREATE TABLE IF NOT EXISTS banking.reconciliation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_balance_cents bigint,
  book_balance_cents bigint,
  variance_cents bigint,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reconciled', 'disputed')),
  reconciled_by_user_id uuid REFERENCES identity.users(id),
  reconciled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_company_period
  ON banking.reconciliation_sessions (operating_company_id, period_start DESC, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_account_status
  ON banking.reconciliation_sessions (bank_account_id, status);

ALTER TABLE banking.reconciliation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_sessions_company_scope ON banking.reconciliation_sessions;
CREATE POLICY reconciliation_sessions_company_scope
  ON banking.reconciliation_sessions
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON banking.reconciliation_sessions TO ih35_app;

COMMIT;
