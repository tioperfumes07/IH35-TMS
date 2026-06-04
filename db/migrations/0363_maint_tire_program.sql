-- Block B32: maintenance tire program — brands, per-position records, rotation/replacement/tread events
-- NOTE: GO reserved 0362 for B32; 0362 shipped as B30 maintenance.inspections — B32 uses 0363.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.tire_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  manufacturer text NOT NULL DEFAULT '',
  tread_warranty_32nds integer NULL CHECK (tread_warranty_32nds IS NULL OR tread_warranty_32nds > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_maint_tire_brands_company_name UNIQUE (operating_company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_maint_tire_brands_company_active
  ON maintenance.tire_brands (operating_company_id, is_active, sort_order)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS maintenance.tire_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_id uuid NULL REFERENCES mdata.units(id),
  equipment_id uuid NULL REFERENCES mdata.equipment(id),
  position_code text NOT NULL,
  position_group text NOT NULL CHECK (position_group IN ('steer', 'drive', 'trailer')),
  brand_id uuid NULL REFERENCES maintenance.tire_brands(id) ON DELETE SET NULL,
  brand_name text NOT NULL DEFAULT '',
  serial_number text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  tread_depth_32nds numeric(5, 1) NOT NULL DEFAULT 32.0 CHECK (tread_depth_32nds >= 0),
  tread_low_threshold_32nds numeric(5, 1) NOT NULL DEFAULT 4.0 CHECK (tread_low_threshold_32nds >= 0),
  installed_at date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  work_order_id uuid NULL REFERENCES maintenance.work_orders(id) ON DELETE SET NULL,
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_maint_tire_record_scope CHECK (
    (unit_id IS NOT NULL AND equipment_id IS NULL)
    OR (unit_id IS NULL AND equipment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_maint_tire_records_unit_position
  ON maintenance.tire_records (operating_company_id, unit_id, position_code)
  WHERE status = 'active' AND unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maint_tire_records_equipment_position
  ON maintenance.tire_records (operating_company_id, equipment_id, position_code)
  WHERE status = 'active' AND equipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maint_tire_records_low_tread
  ON maintenance.tire_records (operating_company_id, tread_depth_32nds)
  WHERE status = 'active' AND tread_depth_32nds <= tread_low_threshold_32nds;

CREATE TABLE IF NOT EXISTS maintenance.tire_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  tire_record_id uuid NOT NULL REFERENCES maintenance.tire_records(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('rotation', 'replacement', 'tread_audit')),
  from_position_code text NULL,
  to_position_code text NULL,
  tread_depth_32nds numeric(5, 1) NULL CHECK (tread_depth_32nds IS NULL OR tread_depth_32nds >= 0),
  brand_id uuid NULL REFERENCES maintenance.tire_brands(id) ON DELETE SET NULL,
  brand_name text NOT NULL DEFAULT '',
  serial_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_low_tread_alert boolean NOT NULL DEFAULT false,
  work_order_id uuid NULL REFERENCES maintenance.work_orders(id) ON DELETE SET NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_tire_events_record
  ON maintenance.tire_events (tire_record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maint_tire_events_company
  ON maintenance.tire_events (operating_company_id, created_at DESC);

ALTER TABLE maintenance.tire_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.tire_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.tire_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_tire_brands_company_scope ON maintenance.tire_brands;
CREATE POLICY maint_tire_brands_company_scope
  ON maintenance.tire_brands
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS maint_tire_records_company_scope ON maintenance.tire_records;
CREATE POLICY maint_tire_records_company_scope
  ON maintenance.tire_records
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS maint_tire_events_company_scope ON maintenance.tire_events;
CREATE POLICY maint_tire_events_company_scope
  ON maintenance.tire_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.tire_brands TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.tire_records TO ih35_app;
GRANT SELECT, INSERT ON maintenance.tire_events TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS maintenance.tire_events;
-- DROP TABLE IF EXISTS maintenance.tire_records;
-- DROP TABLE IF EXISTS maintenance.tire_brands;
