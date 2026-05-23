BEGIN;

-- Drift-capture probe: if this resolves to non-null, a prior manual table may exist.
SELECT to_regclass('mdata.qbo_invoices') AS preexisting_qbo_invoices_table;

CREATE TABLE IF NOT EXISTS mdata.qbo_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  invoice_id UUID NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE,
  qbo_id TEXT,
  qbo_sync_token TEXT,
  doc_number TEXT,
  txn_date DATE,
  due_date DATE,
  total_cents BIGINT,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'failed')),
  last_synced_at TIMESTAMPTZ,
  last_push_at TIMESTAMPTZ,
  created_in_tms BOOLEAN NOT NULL DEFAULT true,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, invoice_id)
);

ALTER TABLE mdata.qbo_invoices
  ADD COLUMN IF NOT EXISTS qbo_id TEXT,
  ADD COLUMN IF NOT EXISTS qbo_sync_token TEXT,
  ADD COLUMN IF NOT EXISTS doc_number TEXT,
  ADD COLUMN IF NOT EXISTS txn_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS total_cents BIGINT,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_in_tms BOOLEAN,
  ADD COLUMN IF NOT EXISTS payload_json JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE mdata.qbo_invoices
SET
  sync_status = COALESCE(sync_status, 'pending'),
  created_in_tms = COALESCE(created_in_tms, true),
  payload_json = COALESCE(payload_json, '{}'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE sync_status IS NULL
   OR created_in_tms IS NULL
   OR payload_json IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE mdata.qbo_invoices
  ALTER COLUMN sync_status SET DEFAULT 'pending',
  ALTER COLUMN sync_status SET NOT NULL,
  ALTER COLUMN created_in_tms SET DEFAULT true,
  ALTER COLUMN created_in_tms SET NOT NULL,
  ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb,
  ALTER COLUMN payload_json SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'mdata'
      AND t.relname = 'qbo_invoices'
      AND c.conname = 'qbo_invoices_sync_status_check'
  ) THEN
    ALTER TABLE mdata.qbo_invoices
      ADD CONSTRAINT qbo_invoices_sync_status_check
      CHECK (sync_status IN ('pending', 'synced', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qbo_invoices_company_qbo_id
  ON mdata.qbo_invoices (operating_company_id, qbo_id)
  WHERE qbo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_invoices_company_invoice
  ON mdata.qbo_invoices (operating_company_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_qbo_invoices_company_sync_status
  ON mdata.qbo_invoices (operating_company_id, sync_status, updated_at DESC);

ALTER TABLE mdata.qbo_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_invoices FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_invoices TO ih35_app;

DROP POLICY IF EXISTS qbo_invoices_select_office ON mdata.qbo_invoices;
CREATE POLICY qbo_invoices_select_office ON mdata.qbo_invoices
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id
        FROM org.user_company_access
        WHERE user_id = identity.current_user_id()
          AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS qbo_invoices_sync_all ON mdata.qbo_invoices;
CREATE POLICY qbo_invoices_sync_all ON mdata.qbo_invoices
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

COMMIT;
