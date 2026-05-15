-- P7-FIX-TXN-DEDUP-001 — deterministic dedupe across Plaid + CSV/QBO imports (additive, idempotent).

BEGIN;

ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS normalized_description text NOT NULL DEFAULT '';

UPDATE banking.bank_transactions
SET normalized_description = trim(
  regexp_replace(
    regexp_replace(trim(lower(coalesce(description, ''))), '\s+', ' ', 'g'),
    '(\s+#\d+)+$',
    '',
    'g'
  )
)
WHERE normalized_description = '';

ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS source_ref text;

UPDATE banking.bank_transactions
SET source = CASE
  WHEN plaid_transaction_id IS NOT NULL THEN 'plaid'
  ELSE 'manual'
END
WHERE source IS NULL;

UPDATE banking.bank_transactions
SET source = 'manual'
WHERE source IS NULL OR trim(source) = '';

ALTER TABLE banking.bank_transactions ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE banking.bank_transactions ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_source_chk') THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_source_chk
      CHECK (source IN ('plaid', 'qbo_import', 'manual', 'csv_import'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'banking'
      AND table_name = 'bank_transactions'
      AND column_name = 'dedup_hash'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD COLUMN dedup_hash text GENERATED ALWAYS AS (
        md5(
          bank_account_id::text || '|' ||
          coalesce(posted_date::text, transaction_date::text) || '|' ||
          amount_cents::text || '|' ||
          coalesce(normalized_description, '')
        )
      ) STORED;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY bank_account_id, dedup_hash
      ORDER BY
        CASE source
          WHEN 'plaid' THEN 0
          WHEN 'csv_import' THEN 1
          WHEN 'qbo_import' THEN 2
          ELSE 3
        END,
        created_at ASC
    ) AS rn
  FROM banking.bank_transactions
)
DELETE FROM banking.bank_transactions bt
USING ranked r
WHERE bt.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_account_dedup
  ON banking.bank_transactions (bank_account_id, dedup_hash);

COMMIT;
