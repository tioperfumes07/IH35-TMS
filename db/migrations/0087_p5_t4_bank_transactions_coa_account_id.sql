BEGIN;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS coa_account_id uuid;

DO $$
BEGIN
  IF to_regclass('catalogs.accounts') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bank_transactions_coa_account_id_fkey'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_coa_account_id_fkey
      FOREIGN KEY (coa_account_id) REFERENCES catalogs.accounts(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_coa_account_id
  ON banking.bank_transactions (operating_company_id, coa_account_id)
  WHERE coa_account_id IS NOT NULL;

GRANT SELECT, UPDATE ON banking.bank_transactions TO ih35_app;

COMMIT;

