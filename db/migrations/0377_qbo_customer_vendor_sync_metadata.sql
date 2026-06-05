-- QBO-SYNC-3 — Customers + Vendors pull/reconcile sync metadata on mdata tables
BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text,
  ADD COLUMN IF NOT EXISTS qbo_sync_error text;

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text,
  ADD COLUMN IF NOT EXISTS qbo_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mdata_customers_qbo_sync_status_check'
      AND conrelid = 'mdata.customers'::regclass
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT mdata_customers_qbo_sync_status_check
      CHECK (
        qbo_sync_status IS NULL
        OR qbo_sync_status IN ('synced', 'local_only', 'drift_detected', 'sync_error')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mdata_vendors_qbo_sync_status_check'
      AND conrelid = 'mdata.vendors'::regclass
  ) THEN
    ALTER TABLE mdata.vendors
      ADD CONSTRAINT mdata_vendors_qbo_sync_status_check
      CHECK (
        qbo_sync_status IS NULL
        OR qbo_sync_status IN ('synced', 'local_only', 'drift_detected', 'sync_error')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mdata_customers_qbo_synced_at
  ON mdata.customers (qbo_synced_at)
  WHERE qbo_synced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mdata_vendors_qbo_synced_at
  ON mdata.vendors (qbo_synced_at)
  WHERE qbo_synced_at IS NOT NULL;

COMMIT;
