-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] F9-01 — void merged manual bank stubs instead of hard DELETE.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
-- Additive void + merge pointer so mergeManualBankTransactionStub retains audit evidence
-- (receipt_evidence_r2_key / notes / obligation links). Cursor band 20260901xxxx.

BEGIN;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;
COMMENT ON COLUMN banking.bank_transactions.voided_at IS
  'F9-01 — set when a manual stub is superseded by a Plaid-backed merge. Never hard-DELETE bank money rows.';

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS voided_reason text;
COMMENT ON COLUMN banking.bank_transactions.voided_reason IS
  'F9-01 — why the row was voided (e.g. merged_into_plaid). NULL while active.';

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS merged_into_bank_transaction_id uuid
    REFERENCES banking.bank_transactions (id);
COMMENT ON COLUMN banking.bank_transactions.merged_into_bank_transaction_id IS
  'F9-01 — pointer to the surviving Plaid-backed row after stub merge (self-FK).';

-- Unique (bank_account_id, dedup_hash) must allow a voided stub to share the hash with the survivor.
-- Keep the historical index *name* from 0242 so migration-application-consistency stays honest.
DROP INDEX IF EXISTS banking.uq_bank_transactions_account_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_account_dedup
  ON banking.bank_transactions (bank_account_id, dedup_hash)
  WHERE dedup_hash IS NOT NULL AND voided_at IS NULL;

DROP INDEX IF EXISTS banking.idx_bank_transactions_account_dedup_manual;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_dedup_manual
  ON banking.bank_transactions (bank_account_id, dedup_hash)
  WHERE dedup_hash IS NOT NULL
    AND plaid_transaction_id IS NULL
    AND COALESCE(source, 'manual') = 'manual'
    AND voided_at IS NULL;

-- Self-FK for merge pointer (same-table).
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
