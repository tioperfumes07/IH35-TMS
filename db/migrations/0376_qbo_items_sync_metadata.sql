-- QBO-SYNC-2 — Products & Services / Items pull/reconcile sync metadata on catalogs.items
BEGIN;

ALTER TABLE catalogs.items
  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text,
  ADD COLUMN IF NOT EXISTS qbo_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalogs_items_qbo_sync_status_check'
      AND conrelid = 'catalogs.items'::regclass
  ) THEN
    ALTER TABLE catalogs.items
      ADD CONSTRAINT catalogs_items_qbo_sync_status_check
      CHECK (
        qbo_sync_status IS NULL
        OR qbo_sync_status IN ('synced', 'local_only', 'drift_detected', 'sync_error')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalogs_items_qbo_synced_at
  ON catalogs.items (qbo_synced_at)
  WHERE qbo_synced_at IS NOT NULL;

COMMIT;
