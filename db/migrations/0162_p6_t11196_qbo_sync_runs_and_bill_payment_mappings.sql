-- P6-T11196 — QBO sync runs log, bill payment apply mappings, pg_trgm, bank ledger link.
-- Additive only (Invariant #24).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE banking.bank_accounts
  ADD COLUMN IF NOT EXISTS ledger_account_id uuid REFERENCES catalogs.accounts(id);

ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text;

CREATE INDEX IF NOT EXISTS idx_mdata_equipment_qbo_vendor
  ON mdata.equipment (qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_ledger_account
  ON banking.bank_accounts (ledger_account_id)
  WHERE ledger_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS qbo.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  records_processed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_sync_runs_company_completed
  ON qbo.sync_runs (operating_company_id, completed_at DESC NULLS LAST);

ALTER TABLE qbo.sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_runs_company_scope ON qbo.sync_runs;
CREATE POLICY sync_runs_company_scope
  ON qbo.sync_runs
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE TABLE IF NOT EXISTS qbo.bill_payment_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  payment_id UUID NOT NULL,
  qbo_bill_payment_id TEXT NOT NULL,
  bill_id UUID NOT NULL,
  qbo_bill_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_bill_payment_mappings_payment
  ON qbo.bill_payment_mappings (payment_id);

ALTER TABLE qbo.bill_payment_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bill_payment_mappings_company_scope ON qbo.bill_payment_mappings;
CREATE POLICY bill_payment_mappings_company_scope
  ON qbo.bill_payment_mappings
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON qbo.sync_runs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo.bill_payment_mappings TO ih35_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_sync_runs ON qbo.sync_runs;
      CREATE TRIGGER tg_audit_sync_runs
      AFTER INSERT OR UPDATE OR DELETE ON qbo.sync_runs
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;

    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_bill_payment_mappings ON qbo.bill_payment_mappings;
      CREATE TRIGGER tg_audit_bill_payment_mappings
      AFTER INSERT OR UPDATE OR DELETE ON qbo.bill_payment_mappings
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

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

COMMIT;
