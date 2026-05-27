BEGIN;

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_idempotency_key
  ON accounting.journal_entries (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
