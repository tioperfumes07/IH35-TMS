-- B10 / FAULT-S3-QBO-COA-SYNC-PUSH — local chart-of-accounts push tracking on accounting.qbo_accounts
-- Reversible: see DOWN section at file end.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.qbo_accounts') IS NULL THEN
    CREATE TABLE accounting.qbo_accounts (LIKE mdata.qbo_accounts INCLUDING DEFAULTS);
    ALTER TABLE accounting.qbo_accounts ADD PRIMARY KEY (id);
    INSERT INTO accounting.qbo_accounts
    SELECT *
    FROM mdata.qbo_accounts;
  END IF;
END $$;

ALTER TABLE accounting.qbo_accounts
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'unsynced',
  ADD COLUMN IF NOT EXISTS qbo_push_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qbo_last_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_last_error text,
  ADD COLUMN IF NOT EXISTS parent_synced boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'qbo_accounts_parent_id_fkey'
      AND conrelid = 'accounting.qbo_accounts'::regclass
  ) THEN
    ALTER TABLE accounting.qbo_accounts
      ADD CONSTRAINT qbo_accounts_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES accounting.qbo_accounts (id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE accounting.qbo_accounts child
SET parent_id = parent.id
FROM accounting.qbo_accounts parent
WHERE child.parent_id IS NULL
  AND child.payload_json #>> '{ParentRef,value}' IS NOT NULL
  AND parent.qbo_id = child.payload_json #>> '{ParentRef,value}'
  AND parent.operating_company_id = child.operating_company_id;

UPDATE accounting.qbo_accounts
SET
  sync_status = CASE
    WHEN qbo_id IS NOT NULL THEN 'synced'
    WHEN sync_status IS NULL OR sync_status = 'unsynced' THEN 'unsynced'
    ELSE sync_status
  END,
  qbo_push_attempts = COALESCE(qbo_push_attempts, 0)
WHERE sync_status IS NULL OR qbo_push_attempts IS NULL;

UPDATE accounting.qbo_accounts child
SET parent_synced = (parent.qbo_id IS NOT NULL)
FROM accounting.qbo_accounts parent
WHERE child.parent_id = parent.id
  AND child.parent_synced IS DISTINCT FROM (parent.qbo_id IS NOT NULL);

ALTER TABLE accounting.qbo_accounts
  ALTER COLUMN sync_status SET DEFAULT 'unsynced',
  ALTER COLUMN sync_status SET NOT NULL,
  ALTER COLUMN qbo_push_attempts SET DEFAULT 0,
  ALTER COLUMN qbo_push_attempts SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'qbo_accounts_sync_status_check'
      AND conrelid = 'accounting.qbo_accounts'::regclass
  ) THEN
    ALTER TABLE accounting.qbo_accounts
      ADD CONSTRAINT qbo_accounts_sync_status_check
      CHECK (sync_status IN ('unsynced', 'pushing', 'synced', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qbo_accounts_sync_status
  ON accounting.qbo_accounts (sync_status, qbo_push_attempts)
  WHERE qbo_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_accounts_parent_id
  ON accounting.qbo_accounts (parent_id)
  WHERE qbo_id IS NULL AND parent_id IS NOT NULL;

ALTER TABLE accounting.qbo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.qbo_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_accounts_accounting_tenant_scope ON accounting.qbo_accounts;
CREATE POLICY qbo_accounts_accounting_tenant_scope
  ON accounting.qbo_accounts
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.qbo_accounts TO ih35_app;

COMMIT;

-- DOWN
-- BEGIN;
-- DROP POLICY IF EXISTS qbo_accounts_accounting_tenant_scope ON accounting.qbo_accounts;
-- DROP INDEX IF EXISTS idx_qbo_accounts_parent_id;
-- DROP INDEX IF EXISTS idx_qbo_accounts_sync_status;
-- ALTER TABLE accounting.qbo_accounts DROP CONSTRAINT IF EXISTS qbo_accounts_sync_status_check;
-- ALTER TABLE accounting.qbo_accounts DROP CONSTRAINT IF EXISTS qbo_accounts_parent_id_fkey;
-- ALTER TABLE accounting.qbo_accounts
--   DROP COLUMN IF EXISTS sync_status,
--   DROP COLUMN IF EXISTS qbo_push_attempts,
--   DROP COLUMN IF EXISTS qbo_last_push_at,
--   DROP COLUMN IF EXISTS qbo_last_error,
--   DROP COLUMN IF EXISTS parent_synced,
--   DROP COLUMN IF EXISTS parent_id;
-- COMMIT;
