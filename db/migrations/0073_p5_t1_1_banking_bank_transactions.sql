BEGIN;

CREATE SCHEMA IF NOT EXISTS banking;

GRANT USAGE ON SCHEMA banking TO ih35_app;

CREATE TABLE IF NOT EXISTS banking.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  plaid_transaction_id text UNIQUE,
  transaction_date date NOT NULL,
  posted_date date,
  amount_cents bigint NOT NULL,
  description text,
  merchant_name text,
  plaid_category text[] NOT NULL DEFAULT '{}',
  pending boolean NOT NULL DEFAULT false,
  is_credit boolean NOT NULL DEFAULT false,
  matched_load_id uuid REFERENCES mdata.loads(id),
  matched_bill_id uuid,
  matched_settlement_id uuid,
  qbo_synced_at timestamptz,
  qbo_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bank_transactions_matched_bill_id_fkey'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_bill_id_fkey
      FOREIGN KEY (matched_bill_id) REFERENCES accounting.bills(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('driver_pay.settlements') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bank_transactions_matched_settlement_id_fkey'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_settlement_id_fkey
      FOREIGN KEY (matched_settlement_id) REFERENCES driver_pay.settlements(id);
  ELSIF to_regclass('driver_finance.driver_settlements') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bank_transactions_matched_settlement_id_fkey'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_settlement_id_fkey
      FOREIGN KEY (matched_settlement_id) REFERENCES driver_finance.driver_settlements(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date
  ON banking.bank_transactions (bank_account_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_date
  ON banking.bank_transactions (operating_company_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_load
  ON banking.bank_transactions (matched_load_id)
  WHERE matched_load_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_unsynced_qbo
  ON banking.bank_transactions (qbo_synced_at)
  WHERE qbo_synced_at IS NULL;

ALTER TABLE banking.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_transactions_company_scope ON banking.bank_transactions;
CREATE POLICY bank_transactions_company_scope
  ON banking.bank_transactions
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON banking.bank_transactions TO ih35_app;

COMMIT;
