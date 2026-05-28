BEGIN;

CREATE TABLE IF NOT EXISTS accounting.bill_unit_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  bill_id UUID NOT NULL REFERENCES accounting.bills(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES mdata.assets(id),
  allocation_method TEXT NOT NULL CHECK (
    allocation_method IN ('equal', 'by_value', 'by_miles', 'manual_pct')
  ),
  allocation_pct NUMERIC(7,4) NOT NULL CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  allocated_amount_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_unit_allocation_bill_id
  ON accounting.bill_unit_allocation (bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_unit_allocation_asset_id
  ON accounting.bill_unit_allocation (asset_id);
CREATE INDEX IF NOT EXISTS idx_bill_unit_allocation_tenant_id
  ON accounting.bill_unit_allocation (tenant_id);

ALTER TABLE accounting.bill_unit_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.bill_unit_allocation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bill_unit_allocation_tenant_scope ON accounting.bill_unit_allocation;
CREATE POLICY bill_unit_allocation_tenant_scope
  ON accounting.bill_unit_allocation
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.bill_unit_allocation TO ih35_app;

COMMIT;
