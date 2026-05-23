BEGIN;

CREATE SCHEMA IF NOT EXISTS bank;
GRANT USAGE ON SCHEMA bank TO ih35_app;

CREATE TABLE IF NOT EXISTS bank.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES banking.bank_transactions(id) ON DELETE CASCADE,
  ledger_entry_kind text NOT NULL CHECK (ledger_entry_kind IN ('payment','bill_payment','transfer','je')),
  ledger_entry_id uuid NOT NULL,
  match_score numeric(5,4) NOT NULL DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 1),
  match_state text NOT NULL CHECK (match_state IN ('auto_matched','user_matched','rejected')),
  matched_at timestamptz NOT NULL DEFAULT now(),
  matched_by_user_uuid uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_company_tx
  ON bank.reconciliation_matches (operating_company_id, bank_transaction_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_company_state
  ON bank.reconciliation_matches (operating_company_id, match_state, matched_at DESC);

ALTER TABLE bank.reconciliation_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_matches_company_scope ON bank.reconciliation_matches;
CREATE POLICY reconciliation_matches_company_scope
  ON bank.reconciliation_matches
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON bank.reconciliation_matches TO ih35_app;

COMMIT;
