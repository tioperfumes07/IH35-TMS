BEGIN;

CREATE SCHEMA IF NOT EXISTS maint;

CREATE TABLE IF NOT EXISTS maint.part (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NULL,
  unit_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  qty_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS maint.pm_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  asset_id UUID NOT NULL REFERENCES mdata.assets(id),
  pm_type TEXT NOT NULL CHECK (
    pm_type IN ('oil', 'tires', 'dot_inspection', 'brake', 'transmission', 'coolant', 'other')
  ),
  interval_miles INTEGER NULL CHECK (interval_miles IS NULL OR interval_miles > 0),
  interval_days INTEGER NULL CHECK (interval_days IS NULL OR interval_days > 0),
  last_done_miles INTEGER NULL CHECK (last_done_miles IS NULL OR last_done_miles >= 0),
  last_done_date DATE NULL,
  next_due_miles INTEGER NULL CHECK (next_due_miles IS NULL OR next_due_miles >= 0),
  next_due_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (interval_miles IS NOT NULL OR interval_days IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_maint_part_tenant_sku ON maint.part (tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_maint_part_tenant_reorder ON maint.part (tenant_id, reorder_point, qty_on_hand);

CREATE INDEX IF NOT EXISTS idx_maint_pm_schedule_tenant_asset ON maint.pm_schedule (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_maint_pm_schedule_tenant_due_miles ON maint.pm_schedule (tenant_id, next_due_miles);
CREATE INDEX IF NOT EXISTS idx_maint_pm_schedule_tenant_due_date ON maint.pm_schedule (tenant_id, next_due_date);

ALTER TABLE maint.part ENABLE ROW LEVEL SECURITY;
ALTER TABLE maint.part FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_part_tenant_scope ON maint.part;
CREATE POLICY maint_part_tenant_scope
  ON maint.part
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

ALTER TABLE maint.pm_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE maint.pm_schedule FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_pm_schedule_tenant_scope ON maint.pm_schedule;
CREATE POLICY maint_pm_schedule_tenant_scope
  ON maint.pm_schedule
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_maint_part_updated_at ON maint.part;
CREATE TRIGGER trg_maint_part_updated_at
  BEFORE UPDATE ON maint.part
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_maint_pm_schedule_updated_at ON maint.pm_schedule;
CREATE TRIGGER trg_maint_pm_schedule_updated_at
  BEFORE UPDATE ON maint.pm_schedule
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT USAGE ON SCHEMA maint TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON maint.part TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON maint.pm_schedule TO ih35_app;

COMMIT;
