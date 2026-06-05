-- QBO-SYNC-1 — Chart of Accounts pull/reconcile sync metadata on catalogs.accounts
BEGIN;

ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text,
  ADD COLUMN IF NOT EXISTS qbo_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalogs_accounts_qbo_sync_status_check'
      AND conrelid = 'catalogs.accounts'::regclass
  ) THEN
    ALTER TABLE catalogs.accounts
      ADD CONSTRAINT catalogs_accounts_qbo_sync_status_check
      CHECK (
        qbo_sync_status IS NULL
        OR qbo_sync_status IN ('synced', 'local_only', 'drift_detected', 'sync_error')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalogs_accounts_qbo_synced_at
  ON catalogs.accounts (qbo_synced_at)
  WHERE qbo_synced_at IS NOT NULL;

COMMIT;
