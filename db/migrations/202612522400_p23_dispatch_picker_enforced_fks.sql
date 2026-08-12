-- P23-DISPATCH-UNCONSTRAINED-UUID-COLUMNS
-- Every picker below writes an enforced canonical FK. Composite keys prevent cross-company
-- border-crossing links; equipment transfers target the canonical trailer/chassis roster.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_id_operating_company_uidx
  ON mdata.drivers (id, operating_company_id);
CREATE UNIQUE INDEX IF NOT EXISTS loads_id_operating_company_uidx
  ON mdata.loads (id, operating_company_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_border_crossings_driver_company_fk') THEN
    ALTER TABLE mdata.unit_border_crossings
      ADD CONSTRAINT unit_border_crossings_driver_company_fk
      FOREIGN KEY (driver_id, operating_company_id)
      REFERENCES mdata.drivers (id, operating_company_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_border_crossings_load_company_fk') THEN
    ALTER TABLE mdata.unit_border_crossings
      ADD CONSTRAINT unit_border_crossings_load_company_fk
      FOREIGN KEY (load_id, operating_company_id)
      REFERENCES mdata.loads (id, operating_company_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_transfer_requests_equipment_fk') THEN
    ALTER TABLE dispatch.equipment_transfer_requests
      ADD CONSTRAINT equipment_transfer_requests_equipment_fk
      FOREIGN KEY (equipment_uuid) REFERENCES mdata.equipment (id) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ubc_driver_company
  ON mdata.unit_border_crossings (driver_id, operating_company_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ubc_load_company
  ON mdata.unit_border_crossings (load_id, operating_company_id) WHERE load_id IS NOT NULL;

COMMIT;
