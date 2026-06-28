-- CLOSURE-10: Enhanced maintenance parts master catalog by manufacturer.
BEGIN;

CREATE SCHEMA IF NOT EXISTS mdata;

CREATE TABLE IF NOT EXISTS mdata.maintenance_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  sku text NOT NULL,
  part_name text NOT NULL,
  manufacturer text NOT NULL,
  model_compatibility text[] NOT NULL DEFAULT '{}',
  category text NOT NULL CHECK (
    category IN (
      'engine','transmission','brake','tire','suspension',
      'electrical','fuel_system','cooling','exhaust','cabin',
      'reefer','body','fluid','filter','other'
    )
  ),
  sub_category text,
  typical_unit_cost_cents bigint NOT NULL DEFAULT 0 CHECK (typical_unit_cost_cents >= 0),
  typical_vendor_id uuid,
  barcode_upc text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, sku)
);

CREATE INDEX IF NOT EXISTS ix_maint_parts_company_manufacturer
  ON mdata.maintenance_parts (operating_company_id, manufacturer, category);

CREATE INDEX IF NOT EXISTS ix_maint_parts_sku_gin
  ON mdata.maintenance_parts USING gin (to_tsvector('english', sku || ' ' || part_name || ' ' || manufacturer));

ALTER TABLE mdata.maintenance_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_parts_tenant_scope ON mdata.maintenance_parts;
CREATE POLICY maintenance_parts_tenant_scope ON mdata.maintenance_parts
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.maintenance_parts TO ih35_app;

COMMIT;
