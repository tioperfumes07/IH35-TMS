-- Block B33: warranty parts coverage + claims workflow
-- NOTE: GO reserved 0363 for B33; 0363 shipped as B32 maint_tire_program — B33 uses 0365. 0364 reserved for B35 KPI dashboard.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.parts_warranty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  parts_inventory_id uuid NULL REFERENCES maintenance.parts_inventory(id) ON DELETE SET NULL,
  part_description text NOT NULL,
  vendor_id uuid NULL REFERENCES mdata.vendors(id) ON DELETE SET NULL,
  warranty_months integer NOT NULL DEFAULT 12 CHECK (warranty_months > 0),
  purchased_at date NOT NULL DEFAULT CURRENT_DATE,
  expires_at date NOT NULL,
  original_invoice_number text NOT NULL DEFAULT '',
  work_order_id uuid NULL REFERENCES maintenance.work_orders(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_parts_warranty_company_active
  ON maintenance.parts_warranty (operating_company_id, expires_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maint_parts_warranty_inventory
  ON maintenance.parts_warranty (parts_inventory_id)
  WHERE parts_inventory_id IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS maintenance.warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  parts_warranty_id uuid NULL REFERENCES maintenance.parts_warranty(id) ON DELETE SET NULL,
  work_order_id uuid NULL REFERENCES maintenance.work_orders(id) ON DELETE SET NULL,
  vendor_id uuid NULL REFERENCES mdata.vendors(id) ON DELETE SET NULL,
  claim_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'filed', 'pending', 'approved', 'denied', 'reimbursed')
  ),
  part_description text NOT NULL DEFAULT '',
  claim_amount_cents integer NOT NULL DEFAULT 0 CHECK (claim_amount_cents >= 0),
  reimbursement_amount_cents integer NULL CHECK (reimbursement_amount_cents IS NULL OR reimbursement_amount_cents >= 0),
  filed_at timestamptz NULL,
  reimbursement_received_at timestamptz NULL,
  notes text NOT NULL DEFAULT '',
  auto_detected boolean NOT NULL DEFAULT false,
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_warranty_claims_company_status
  ON maintenance.warranty_claims (operating_company_id, status, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maint_warranty_claims_work_order
  ON maintenance.warranty_claims (work_order_id)
  WHERE work_order_id IS NOT NULL AND archived_at IS NULL;

ALTER TABLE maintenance.parts_warranty ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.warranty_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_parts_warranty_company_scope ON maintenance.parts_warranty;
CREATE POLICY maint_parts_warranty_company_scope
  ON maintenance.parts_warranty
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS maint_warranty_claims_company_scope ON maintenance.warranty_claims;
CREATE POLICY maint_warranty_claims_company_scope
  ON maintenance.warranty_claims
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.parts_warranty TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.warranty_claims TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS maintenance.warranty_claims;
-- DROP TABLE IF EXISTS maintenance.parts_warranty;
