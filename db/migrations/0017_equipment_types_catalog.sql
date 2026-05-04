BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'line_item_unit' AND n.nspname = 'catalogs'
  ) THEN
    CREATE TYPE catalogs.line_item_unit AS ENUM (
      'per_loaded_mile',
      'per_empty_mile',
      'per_total_mile',
      'flat_per_occurrence',
      'flat_per_load',
      'percent_of_load_revenue',
      'flat_per_hour'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS catalogs.equipment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS idx_equipment_types_code ON catalogs.equipment_types (code);
CREATE INDEX IF NOT EXISTS idx_equipment_types_active_sort
  ON catalogs.equipment_types (is_active, sort_order)
  WHERE deactivated_at IS NULL;

COMMENT ON TABLE catalogs.equipment_types IS 'Shared global catalog of equipment types (Dry Van, Flatbed, etc.). Used by units, equipment (trailers), driver_equipment_qualifications, loads.';
COMMENT ON COLUMN catalogs.equipment_types.code IS 'Short stable code (e.g., DRY_VAN, FLATBED, REEFER, OVERSIZED). Uppercase, snake_case.';
COMMENT ON COLUMN catalogs.equipment_types.is_active IS 'When false, equipment type is not selectable in UI for new records (existing records keep the reference).';

GRANT SELECT, INSERT, UPDATE ON catalogs.equipment_types TO ih35_app;
ALTER TABLE catalogs.equipment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.equipment_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_types_select_all ON catalogs.equipment_types;
CREATE POLICY equipment_types_select_all ON catalogs.equipment_types
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS equipment_types_insert_admin ON catalogs.equipment_types;
CREATE POLICY equipment_types_insert_admin ON catalogs.equipment_types
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS equipment_types_update_admin ON catalogs.equipment_types;
CREATE POLICY equipment_types_update_admin ON catalogs.equipment_types
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS equipment_types_lucia_bypass ON catalogs.equipment_types;
CREATE POLICY equipment_types_lucia_bypass ON catalogs.equipment_types
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

CREATE TABLE IF NOT EXISTS catalogs.equipment_line_item_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type_id uuid NOT NULL REFERENCES catalogs.equipment_types(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  unit catalogs.line_item_unit NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  UNIQUE (equipment_type_id, code)
);

CREATE INDEX IF NOT EXISTS idx_line_item_templates_eqtype
  ON catalogs.equipment_line_item_templates (equipment_type_id, sort_order)
  WHERE deactivated_at IS NULL;

COMMENT ON TABLE catalogs.equipment_line_item_templates IS 'Per-equipment-type line item definitions. Each driver who is qualified for this equipment type gets one rate row per template line item (in mdata.driver_equipment_qualifications, Block #20).';
COMMENT ON COLUMN catalogs.equipment_line_item_templates.code IS 'Short code unique within an equipment type (e.g., LOADED_MILE, EMPTY_MILE, TARP, EXTRA_DROP). Used as stable key for UI labels and reporting.';
COMMENT ON COLUMN catalogs.equipment_line_item_templates.unit IS 'Unit of measure for the rate value: per_loaded_mile = $0.50/loaded mile, flat_per_occurrence = $50 per drop, etc.';
COMMENT ON COLUMN catalogs.equipment_line_item_templates.is_required IS 'When true, every driver qualification for this equipment type must have a rate set for this line item before the qualification can be activated.';

GRANT SELECT, INSERT, UPDATE ON catalogs.equipment_line_item_templates TO ih35_app;
ALTER TABLE catalogs.equipment_line_item_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.equipment_line_item_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS line_item_templates_select_all ON catalogs.equipment_line_item_templates;
CREATE POLICY line_item_templates_select_all ON catalogs.equipment_line_item_templates
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS line_item_templates_insert_admin ON catalogs.equipment_line_item_templates;
CREATE POLICY line_item_templates_insert_admin ON catalogs.equipment_line_item_templates
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS line_item_templates_update_admin ON catalogs.equipment_line_item_templates;
CREATE POLICY line_item_templates_update_admin ON catalogs.equipment_line_item_templates
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS line_item_templates_lucia_bypass ON catalogs.equipment_line_item_templates;
CREATE POLICY line_item_templates_lucia_bypass ON catalogs.equipment_line_item_templates
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

INSERT INTO catalogs.equipment_types (code, name, description, sort_order) VALUES
  ('DRY_VAN', 'Dry Van', 'Standard 53-foot enclosed dry van trailer for general freight', 10),
  ('FLATBED', 'Flatbed', 'Open-deck trailer for oversized, building materials, machinery', 20),
  ('REEFER', 'Refrigerated', 'Temperature-controlled trailer for perishables', 30),
  ('OVERSIZED', 'Oversized', 'Specialized trailers for permitted oversize/overweight loads', 40)
ON CONFLICT (code) DO NOTHING;

WITH eq AS (SELECT id, code FROM catalogs.equipment_types WHERE code IN ('DRY_VAN','FLATBED','REEFER','OVERSIZED'))
INSERT INTO catalogs.equipment_line_item_templates (equipment_type_id, code, name, description, unit, sort_order, is_required)
SELECT eq.id, 'LOADED_MILE', 'Loaded mile rate', 'Rate paid per mile when truck is loaded', 'per_loaded_mile'::catalogs.line_item_unit, 10, true FROM eq WHERE code='DRY_VAN'
UNION ALL
SELECT eq.id, 'EMPTY_MILE', 'Empty mile rate', 'Rate paid per mile when truck is empty (deadhead)', 'per_empty_mile'::catalogs.line_item_unit, 20, true FROM eq WHERE code='DRY_VAN'
UNION ALL
SELECT eq.id, 'EXTRA_DROP_PAYMENT', 'Extra drop payment', 'Flat fee paid for each additional drop beyond the first', 'flat_per_occurrence'::catalogs.line_item_unit, 30, false FROM eq WHERE code='DRY_VAN'
UNION ALL
SELECT eq.id, 'LOADED_MILE', 'Loaded mile rate', 'Rate paid per mile when truck is loaded', 'per_loaded_mile'::catalogs.line_item_unit, 10, true FROM eq WHERE code='FLATBED'
UNION ALL
SELECT eq.id, 'EMPTY_MILE', 'Empty mile rate', 'Rate paid per mile when truck is empty (deadhead)', 'per_empty_mile'::catalogs.line_item_unit, 20, true FROM eq WHERE code='FLATBED'
UNION ALL
SELECT eq.id, 'TARP', 'Tarp fee', 'Flat fee paid each time the load requires tarping', 'flat_per_occurrence'::catalogs.line_item_unit, 30, false FROM eq WHERE code='FLATBED'
UNION ALL
SELECT eq.id, 'EXTRA_DROP_PAYMENT', 'Extra drop payment', 'Flat fee paid for each additional drop beyond the first', 'flat_per_occurrence'::catalogs.line_item_unit, 40, false FROM eq WHERE code='FLATBED'
UNION ALL
SELECT eq.id, 'LOADED_MILE', 'Loaded mile rate', 'Rate paid per mile when truck is loaded', 'per_loaded_mile'::catalogs.line_item_unit, 10, true FROM eq WHERE code='REEFER'
UNION ALL
SELECT eq.id, 'EMPTY_MILE', 'Empty mile rate', 'Rate paid per mile when truck is empty (deadhead)', 'per_empty_mile'::catalogs.line_item_unit, 20, true FROM eq WHERE code='REEFER'
UNION ALL
SELECT eq.id, 'EXTRA_DROP_PAYMENT', 'Extra drop payment', 'Flat fee paid for each additional drop beyond the first', 'flat_per_occurrence'::catalogs.line_item_unit, 30, false FROM eq WHERE code='REEFER'
UNION ALL
SELECT eq.id, 'LOADED_MILE', 'Loaded mile rate', 'Rate paid per mile when truck is loaded', 'per_loaded_mile'::catalogs.line_item_unit, 10, true FROM eq WHERE code='OVERSIZED'
UNION ALL
SELECT eq.id, 'EMPTY_MILE', 'Empty mile rate', 'Rate paid per mile when truck is empty (deadhead)', 'per_empty_mile'::catalogs.line_item_unit, 20, true FROM eq WHERE code='OVERSIZED'
UNION ALL
SELECT eq.id, 'PERMIT_FEE', 'Permit fee', 'Flat fee paid for state oversize/overweight permits', 'flat_per_occurrence'::catalogs.line_item_unit, 30, false FROM eq WHERE code='OVERSIZED'
UNION ALL
SELECT eq.id, 'EXTRA_DROP_PAYMENT', 'Extra drop payment', 'Flat fee paid for each additional drop beyond the first', 'flat_per_occurrence'::catalogs.line_item_unit, 40, false FROM eq WHERE code='OVERSIZED'
ON CONFLICT (equipment_type_id, code) DO NOTHING;

COMMIT;
