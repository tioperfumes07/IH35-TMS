BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);
ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);
ALTER TABLE mdata.locations
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);

UPDATE mdata.customers
SET operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')
WHERE operating_company_id IS NULL;
UPDATE mdata.vendors
SET operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')
WHERE operating_company_id IS NULL;
UPDATE mdata.locations
SET operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')
WHERE operating_company_id IS NULL;

ALTER TABLE mdata.customers ALTER COLUMN operating_company_id SET NOT NULL;
ALTER TABLE mdata.vendors ALTER COLUMN operating_company_id SET NOT NULL;
ALTER TABLE mdata.locations ALTER COLUMN operating_company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_operating_company ON mdata.customers (operating_company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_operating_company ON mdata.vendors (operating_company_id);
CREATE INDEX IF NOT EXISTS idx_locations_operating_company ON mdata.locations (operating_company_id);

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS owner_company_id uuid REFERENCES org.companies(id),
  ADD COLUMN IF NOT EXISTS currently_leased_to_company_id uuid REFERENCES org.companies(id);
ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS owner_company_id uuid REFERENCES org.companies(id),
  ADD COLUMN IF NOT EXISTS currently_leased_to_company_id uuid REFERENCES org.companies(id);

UPDATE mdata.units
SET owner_company_id = (SELECT id FROM org.companies WHERE code = 'TRK'),
    currently_leased_to_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')
WHERE owner_company_id IS NULL;

UPDATE mdata.equipment
SET owner_company_id = (SELECT id FROM org.companies WHERE code = 'TRK'),
    currently_leased_to_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')
WHERE owner_company_id IS NULL;

ALTER TABLE mdata.units ALTER COLUMN owner_company_id SET NOT NULL;
ALTER TABLE mdata.equipment ALTER COLUMN owner_company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_units_owner_company ON mdata.units (owner_company_id);
CREATE INDEX IF NOT EXISTS idx_units_leased_company
  ON mdata.units (currently_leased_to_company_id)
  WHERE currently_leased_to_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_owner_company ON mdata.equipment (owner_company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_leased_company
  ON mdata.equipment (currently_leased_to_company_id)
  WHERE currently_leased_to_company_id IS NOT NULL;

COMMIT;
