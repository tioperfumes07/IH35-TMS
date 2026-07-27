-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] F9-01 follow-up — restore canonical index names + FK.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
-- 202609010050 introduced *_active index names after DROP of the historical unique
-- (declared in 0242). Fresh-DB migration-application-consistency requires the 0242
-- index *name* to exist after the full chain. This migration restores the names as
-- partial uniques (voided_at IS NULL) and adds the self-FK on merged_into.

BEGIN;

DROP INDEX IF EXISTS banking.uq_bank_transactions_account_dedup_active;
DROP INDEX IF EXISTS banking.uq_bank_transactions_account_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_account_dedup
  ON banking.bank_transactions (bank_account_id, dedup_hash)
  WHERE dedup_hash IS NOT NULL AND voided_at IS NULL;

DROP INDEX IF EXISTS banking.idx_bank_transactions_account_dedup_manual_active;
DROP INDEX IF EXISTS banking.idx_bank_transactions_account_dedup_manual;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_dedup_manual
  ON banking.bank_transactions (bank_account_id, dedup_hash)
  WHERE dedup_hash IS NOT NULL
    AND plaid_transaction_id IS NULL
    AND COALESCE(source, 'manual') = 'manual'
    AND voided_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_merged_into_fkey'
      AND conrelid = 'banking.bank_transactions'::regclass
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_merged_into_fkey
      FOREIGN KEY (merged_into_bank_transaction_id)
      REFERENCES banking.bank_transactions (id);
  END IF;
END $$;

COMMIT;
