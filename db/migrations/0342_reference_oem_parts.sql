-- Block B17: OEM parts reference templates (global scope, archived_at pattern)
-- Reversible: see DOWN section at end of file.

BEGIN;

CREATE SCHEMA IF NOT EXISTS reference;

CREATE TABLE IF NOT EXISTS reference.oem_parts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand               text NOT NULL,
  model_compat        text,
  oem_part_number     text,
  part_name           text NOT NULL,
  category            text NOT NULL,
  sub_category        text,
  description         text,
  unit_cost_usd_typical numeric(10,2),
  default_supplier    text,
  archived_at         timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz,
  UNIQUE NULLS NOT DISTINCT (brand, oem_part_number)
);

CREATE INDEX IF NOT EXISTS idx_oem_parts_brand_category_active
  ON reference.oem_parts (brand, category)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oem_parts_part_name_lower_active
  ON reference.oem_parts (LOWER(part_name))
  WHERE archived_at IS NULL;

ALTER TABLE reference.oem_parts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON reference.oem_parts TO ih35_app;

DROP POLICY IF EXISTS oem_parts_read ON reference.oem_parts;
CREATE POLICY oem_parts_read ON reference.oem_parts
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS oem_parts_write ON reference.oem_parts;
CREATE POLICY oem_parts_write ON reference.oem_parts
  FOR ALL TO ih35_app USING (true) WITH CHECK (true);

COMMIT;

-- DOWN (manual rollback — run outside transaction if needed):
-- DROP TABLE IF EXISTS reference.oem_parts;
