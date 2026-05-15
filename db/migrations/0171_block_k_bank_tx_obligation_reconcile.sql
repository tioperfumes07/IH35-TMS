-- Block K: obligation reconciliation metadata, manual receipt stubs, Plaid dedup merge helpers.
-- Production-safe: IF NOT EXISTS only; no ih35_app grants in this migration.

BEGIN;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS normalized_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dedup_hash text,
  ADD COLUMN IF NOT EXISTS reconciled_obligation_type text,
  ADD COLUMN IF NOT EXISTS reconciled_obligation_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_evidence_r2_key text;

UPDATE banking.bank_transactions
SET source = CASE
  WHEN plaid_transaction_id IS NOT NULL THEN COALESCE(source, 'plaid')
  ELSE COALESCE(source, 'manual')
END
WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_dedup_manual
  ON banking.bank_transactions (bank_account_id, dedup_hash)
  WHERE dedup_hash IS NOT NULL
    AND plaid_transaction_id IS NULL
    AND COALESCE(source, 'manual') = 'manual';

COMMIT;
