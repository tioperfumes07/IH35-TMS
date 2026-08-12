-- P44 Lists Wave A — canonical equipment/freight load type linkage.
-- Distinct from loads.load_type, whose locked meaning is Broker vs Direct.
BEGIN;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_types_id_company_uniq') THEN
    ALTER TABLE catalogs.load_types ADD CONSTRAINT load_types_id_company_uniq UNIQUE (id, operating_company_id);
  END IF;
END
$migration$;

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS catalog_load_type_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_catalog_load_type_company_fk') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_catalog_load_type_company_fk
      FOREIGN KEY (catalog_load_type_id, operating_company_id)
      REFERENCES catalogs.load_types(id, operating_company_id);
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_loads_company_catalog_load_type
  ON mdata.loads (operating_company_id, catalog_load_type_id)
  WHERE catalog_load_type_id IS NOT NULL;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_catalog_load_type_company_fk') THEN
    RAISE EXCEPTION 'P44 load type linkage: same-opco FK missing';
  END IF;
END
$verify$;

COMMIT;
