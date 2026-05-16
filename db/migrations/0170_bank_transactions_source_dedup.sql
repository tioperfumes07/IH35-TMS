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

ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS dedup_hash text;

-- Self-heal: Production keeps dedup_hash as a plain column filled by computeBankTransactionDedupHash (sha256); attgenerated is empty there.
-- Historically ADD COLUMN IF NOT EXISTS skipped a GENERATED md5 definition whenever dedup_hash already existed as plain text — CI must converge to that shape (no competing DB-side hash).
-- Backfill uses pgcrypto digest + encode(hex) for rows missing a hash so PARTITION BY dedup + DELETE duplicates remain deterministic.
UPDATE banking.bank_transactions
SET dedup_hash = encode(
  digest(
    bank_account_id::text || '|' ||
    transaction_date::text || '|' ||
    abs(round(amount_cents::numeric))::text || '|' ||
    coalesce(normalized_description, ''),
    'sha256'
  ),
  'hex'
)
WHERE dedup_hash IS NULL OR length(trim(dedup_hash)) = 0;

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
