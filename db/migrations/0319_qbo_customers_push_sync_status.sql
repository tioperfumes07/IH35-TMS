-- B8 / FAULT-S1-QBO-CUSTOMERS-SYNC-PUSH — local customer push tracking on accounting.qbo_customers
-- Reversible: see DOWN section at file end.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.qbo_customers') IS NULL THEN
    CREATE TABLE accounting.qbo_customers (LIKE mdata.qbo_customers INCLUDING DEFAULTS);
    ALTER TABLE accounting.qbo_customers ADD PRIMARY KEY (id);
    INSERT INTO accounting.qbo_customers
    SELECT *
    FROM mdata.qbo_customers;
  END IF;
END $$;

ALTER TABLE accounting.qbo_customers
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'unsynced',
  ADD COLUMN IF NOT EXISTS qbo_push_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qbo_last_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_last_error text;

UPDATE accounting.qbo_customers
SET
  sync_status = CASE
    WHEN qbo_id IS NOT NULL THEN 'synced'
    WHEN sync_status IS NULL OR sync_status = 'unsynced' THEN 'unsynced'
    ELSE sync_status
  END,
  qbo_push_attempts = COALESCE(qbo_push_attempts, 0)
WHERE sync_status IS NULL OR qbo_push_attempts IS NULL;

ALTER TABLE accounting.qbo_customers
  ALTER COLUMN sync_status SET DEFAULT 'unsynced',
  ALTER COLUMN sync_status SET NOT NULL,
  ALTER COLUMN qbo_push_attempts SET DEFAULT 0,
  ALTER COLUMN qbo_push_attempts SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'qbo_customers_sync_status_check'
      AND conrelid = 'accounting.qbo_customers'::regclass
  ) THEN
    ALTER TABLE accounting.qbo_customers
      ADD CONSTRAINT qbo_customers_sync_status_check
      CHECK (sync_status IN ('unsynced', 'pushing', 'synced', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qbo_customers_sync_status
  ON accounting.qbo_customers (sync_status, qbo_push_attempts)
  WHERE qbo_id IS NULL;

ALTER TABLE accounting.qbo_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.qbo_customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_customers_accounting_tenant_scope ON accounting.qbo_customers;
CREATE POLICY qbo_customers_accounting_tenant_scope
  ON accounting.qbo_customers
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.qbo_customers TO ih35_app;

ALTER TABLE audit.row_changes
  ADD COLUMN IF NOT EXISTS action text;

CREATE INDEX IF NOT EXISTS idx_audit_row_changes_qbo_push
  ON audit.row_changes (action, changed_at DESC)
  WHERE action = 'qbo_push';

COMMIT;

-- DOWN
-- BEGIN;
-- DROP INDEX IF EXISTS idx_audit_row_changes_qbo_push;
-- ALTER TABLE audit.row_changes DROP COLUMN IF EXISTS action;
-- DROP POLICY IF EXISTS qbo_customers_accounting_tenant_scope ON accounting.qbo_customers;
-- DROP INDEX IF EXISTS idx_qbo_customers_sync_status;
-- ALTER TABLE accounting.qbo_customers DROP CONSTRAINT IF EXISTS qbo_customers_sync_status_check;
-- ALTER TABLE accounting.qbo_customers
--   DROP COLUMN IF EXISTS sync_status,
--   DROP COLUMN IF EXISTS qbo_push_attempts,
--   DROP COLUMN IF EXISTS qbo_last_push_at,
--   DROP COLUMN IF EXISTS qbo_last_error;
-- COMMIT;
