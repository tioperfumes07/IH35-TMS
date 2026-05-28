-- ACCT-11 corrective addendum:
-- PSE posting enforcement + vendor subtype suggestion contract.

BEGIN;

ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS ps_category_qbo_id text,
  ADD COLUMN IF NOT EXISTS ps_item_qbo_id text;

ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS ps_category_qbo_id text,
  ADD COLUMN IF NOT EXISTS ps_item_qbo_id text;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS pse_ps_category_qbo_id text,
  ADD COLUMN IF NOT EXISTS pse_ps_item_qbo_id text,
  ADD COLUMN IF NOT EXISTS pse_qbo_account_id numeric,
  ADD COLUMN IF NOT EXISTS pse_vendor_subtype_suggestion text;

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS ps_category_qbo_id text,
  ADD COLUMN IF NOT EXISTS ps_item_qbo_id text,
  ADD COLUMN IF NOT EXISTS ps_qbo_account_id numeric,
  ADD COLUMN IF NOT EXISTS ps_enforced_at timestamptz;

CREATE TABLE IF NOT EXISTS accounting.pse_posting_policy (
  tenant_id uuid PRIMARY KEY REFERENCES org.companies(id) ON DELETE CASCADE,
  enforce_posting boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting.vendor_subtype_pse_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  vendor_subtype text NOT NULL,
  ps_category_qbo_id text NOT NULL,
  ps_item_qbo_id text NOT NULL,
  qbo_account_id numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vendor_subtype)
);

CREATE INDEX IF NOT EXISTS idx_vendor_subtype_pse_map_tenant_active
  ON accounting.vendor_subtype_pse_map (tenant_id, active, vendor_subtype);

ALTER TABLE accounting.pse_posting_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.pse_posting_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.vendor_subtype_pse_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.vendor_subtype_pse_map FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pse_posting_policy_tenant_scope ON accounting.pse_posting_policy;
CREATE POLICY pse_posting_policy_tenant_scope
  ON accounting.pse_posting_policy
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS vendor_subtype_pse_map_tenant_scope ON accounting.vendor_subtype_pse_map;
CREATE POLICY vendor_subtype_pse_map_tenant_scope
  ON accounting.vendor_subtype_pse_map
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_pse_posting_policy_updated_at ON accounting.pse_posting_policy;
CREATE TRIGGER trg_pse_posting_policy_updated_at
  BEFORE UPDATE ON accounting.pse_posting_policy
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_vendor_subtype_pse_map_updated_at ON accounting.vendor_subtype_pse_map;
CREATE TRIGGER trg_vendor_subtype_pse_map_updated_at
  BEFORE UPDATE ON accounting.vendor_subtype_pse_map
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.pse_posting_policy TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.vendor_subtype_pse_map TO ih35_app;

COMMIT;
