-- B9 / FAULT-S2-QBO-VENDORS-SYNC-PUSH — local vendor push tracking on accounting.qbo_vendors
-- Reversible: see DOWN section at file end.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.qbo_vendors') IS NULL THEN
    CREATE TABLE accounting.qbo_vendors (LIKE mdata.qbo_vendors INCLUDING DEFAULTS);
    ALTER TABLE accounting.qbo_vendors ADD PRIMARY KEY (id);
    INSERT INTO accounting.qbo_vendors
    SELECT *
    FROM mdata.qbo_vendors;
  END IF;
END $$;

ALTER TABLE accounting.qbo_vendors
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'unsynced',
  ADD COLUMN IF NOT EXISTS qbo_push_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qbo_last_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_last_error text,
  ADD COLUMN IF NOT EXISTS eligible_1099 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_terms_qbo_id text,
  ADD COLUMN IF NOT EXISTS default_ap_account_qbo_id text;

UPDATE accounting.qbo_vendors
SET
  sync_status = CASE
    WHEN qbo_id IS NOT NULL THEN 'synced'
    WHEN sync_status IS NULL OR sync_status = 'unsynced' THEN 'unsynced'
    ELSE sync_status
  END,
  qbo_push_attempts = COALESCE(qbo_push_attempts, 0),
  eligible_1099 = COALESCE(
    eligible_1099,
    COALESCE((payload_json ->> 'Vendor1099')::boolean, (payload_json ->> 'eligible_1099')::boolean, false)
  ),
  payment_terms_qbo_id = COALESCE(
    payment_terms_qbo_id,
    payload_json #>> '{TermRef,value}',
    payload_json ->> 'payment_terms_qbo_id'
  ),
  default_ap_account_qbo_id = COALESCE(
    default_ap_account_qbo_id,
    payload_json #>> '{APAccountRef,value}',
    payload_json ->> 'default_ap_account_qbo_id'
  )
WHERE sync_status IS NULL
   OR qbo_push_attempts IS NULL
   OR eligible_1099 IS NULL
   OR (payment_terms_qbo_id IS NULL AND payload_json IS NOT NULL)
   OR (default_ap_account_qbo_id IS NULL AND payload_json IS NOT NULL);

ALTER TABLE accounting.qbo_vendors
  ALTER COLUMN sync_status SET DEFAULT 'unsynced',
  ALTER COLUMN sync_status SET NOT NULL,
  ALTER COLUMN qbo_push_attempts SET DEFAULT 0,
  ALTER COLUMN qbo_push_attempts SET NOT NULL,
  ALTER COLUMN eligible_1099 SET DEFAULT false,
  ALTER COLUMN eligible_1099 SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'qbo_vendors_sync_status_check'
      AND conrelid = 'accounting.qbo_vendors'::regclass
  ) THEN
    ALTER TABLE accounting.qbo_vendors
      ADD CONSTRAINT qbo_vendors_sync_status_check
      CHECK (sync_status IN ('unsynced', 'pushing', 'synced', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qbo_vendors_sync_status
  ON accounting.qbo_vendors (sync_status, qbo_push_attempts)
  WHERE qbo_id IS NULL;

ALTER TABLE accounting.qbo_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.qbo_vendors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_vendors_accounting_tenant_scope ON accounting.qbo_vendors;
CREATE POLICY qbo_vendors_accounting_tenant_scope
  ON accounting.qbo_vendors
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.qbo_vendors TO ih35_app;

COMMIT;

-- DOWN
-- BEGIN;
-- DROP POLICY IF EXISTS qbo_vendors_accounting_tenant_scope ON accounting.qbo_vendors;
-- DROP INDEX IF EXISTS idx_qbo_vendors_sync_status;
-- ALTER TABLE accounting.qbo_vendors DROP CONSTRAINT IF EXISTS qbo_vendors_sync_status_check;
-- ALTER TABLE accounting.qbo_vendors
--   DROP COLUMN IF EXISTS sync_status,
--   DROP COLUMN IF EXISTS qbo_push_attempts,
--   DROP COLUMN IF EXISTS qbo_last_push_at,
--   DROP COLUMN IF EXISTS qbo_last_error,
--   DROP COLUMN IF EXISTS eligible_1099,
--   DROP COLUMN IF EXISTS payment_terms_qbo_id,
--   DROP COLUMN IF EXISTS default_ap_account_qbo_id;
-- COMMIT;
