-- P7-FIX-VERIFY-CONTENT-DRIFT
-- Additive reconciliation for verified real drift objects.
BEGIN;

-- 0095 drift: column missing in runtime schema.
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS severity text;

-- 0162 drift: missing AP aging view.
CREATE OR REPLACE VIEW views.ap_aging
WITH (security_invoker = true)
AS
WITH open_bills AS (
  SELECT
    b.operating_company_id,
    b.vendor_uuid,
    b.vendor_id,
    GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0)::bigint AS open_cents,
    COALESCE(b.due_date, b.bill_date) AS eff_due
  FROM accounting.bills b
  WHERE b.revoked_at IS NULL
    AND b.status IN ('unpaid', 'partial')
    AND GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0) > 0
)
SELECT
  ob.operating_company_id,
  COALESCE(NULLIF(trim(ob.vendor_uuid), ''), ob.vendor_id, 'unknown') AS vendor_id,
  COALESCE(v.vendor_name, ob.vendor_id, 'Unknown vendor') AS vendor_name,
  COUNT(*)::int AS open_bill_count,
  COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due >= CURRENT_DATE), 0)::bigint AS current_cents,
  COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < CURRENT_DATE AND ob.eff_due >= CURRENT_DATE - INTERVAL '30 days'), 0)::bigint AS bucket_1_30_cents,
  COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < CURRENT_DATE - INTERVAL '30 days' AND ob.eff_due >= CURRENT_DATE - INTERVAL '60 days'), 0)::bigint AS bucket_31_60_cents,
  COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < CURRENT_DATE - INTERVAL '60 days' AND ob.eff_due >= CURRENT_DATE - INTERVAL '90 days'), 0)::bigint AS bucket_61_90_cents,
  COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < CURRENT_DATE - INTERVAL '90 days'), 0)::bigint AS bucket_91_plus_cents,
  COALESCE(SUM(ob.open_cents), 0)::bigint AS total_open_cents
FROM open_bills ob
LEFT JOIN mdata.vendors v ON ob.vendor_uuid IS NOT NULL AND v.id::text = trim(ob.vendor_uuid)
GROUP BY ob.operating_company_id, COALESCE(NULLIF(trim(ob.vendor_uuid), ''), ob.vendor_id, 'unknown'), COALESCE(v.vendor_name, ob.vendor_id, 'Unknown vendor');

GRANT SELECT ON views.ap_aging TO ih35_app;

-- 0162 drift: missing equipment vendor link column/index.
ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text;

CREATE INDEX IF NOT EXISTS idx_mdata_equipment_qbo_vendor
  ON mdata.equipment (qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;

-- 0162 drift: missing bank account ledger-account partial index.
CREATE INDEX IF NOT EXISTS idx_bank_accounts_ledger_account
  ON banking.bank_accounts (ledger_account_id)
  WHERE ledger_account_id IS NOT NULL;

-- 0163 drift: missing dead-letter throttle table + RLS + grants.
CREATE TABLE IF NOT EXISTS qbo.sync_dead_letter_email_throttle (
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  kind TEXT NOT NULL,
  alert_day DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, kind, alert_day)
);

ALTER TABLE qbo.sync_dead_letter_email_throttle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_dead_letter_email_throttle_scope ON qbo.sync_dead_letter_email_throttle;
CREATE POLICY sync_dead_letter_email_throttle_scope
  ON qbo.sync_dead_letter_email_throttle
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON qbo.sync_dead_letter_email_throttle TO ih35_app;

-- 0163 drift: missing qbo.sync_runs payload field.
ALTER TABLE qbo.sync_runs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 0163 renamed drift: canonical index absent.
CREATE INDEX IF NOT EXISTS ix_outbox_events_company_pending
  ON accounting.outbox_events (operating_company_id, created_at DESC)
  WHERE status = 'pending';

-- 0166 renamed drift: canonical queue indexes absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'sms'
      AND table_name = 'queue'
      AND column_name = 'operating_company_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_sms_queue_company_created_at ON sms.queue (operating_company_id, created_at DESC)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_sms_queue_company_created_at ON sms.queue (created_at DESC)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'whatsapp'
      AND table_name = 'queue'
      AND column_name = 'operating_company_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_whatsapp_queue_company_created_at ON whatsapp.queue (operating_company_id, created_at DESC)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_whatsapp_queue_company_created_at ON whatsapp.queue (created_at DESC)';
  END IF;
END
$$;

-- 0170 drift: source_ref column/index missing.
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS source_ref text;

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
  WHERE dedup_hash IS NOT NULL
)
DELETE FROM banking.bank_transactions bt
USING ranked r
WHERE bt.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_account_dedup
  ON banking.bank_transactions (bank_account_id, dedup_hash);

-- 0172 drift: canonical index names absent.
CREATE INDEX IF NOT EXISTS ix_mdata_loads_company_status_updated
  ON mdata.loads (operating_company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_driver_settlements_driver_period
  ON driver_finance.driver_settlements (driver_id, period_start);

COMMIT;
