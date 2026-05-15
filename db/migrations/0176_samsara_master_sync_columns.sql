-- P7 — Columns for Samsara master sync upserts (additive).

BEGIN;

ALTER TABLE mdata.drivers ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);

DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'drivers' AND column_name = 'samsara_driver_id'
    ) THEN
      ALTER TABLE mdata.drivers ADD COLUMN samsara_driver_id text NULL;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdata_drivers_company_samsara_driver
  ON mdata.drivers (operating_company_id, samsara_driver_id)
  WHERE samsara_driver_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('mdata.equipment') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'equipment' AND column_name = 'samsara_vehicle_id'
    ) THEN
      ALTER TABLE mdata.equipment ADD COLUMN samsara_vehicle_id text NULL;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdata_equipment_company_samsara_vehicle
  ON mdata.equipment (
    COALESCE(currently_leased_to_company_id, owner_company_id),
    samsara_vehicle_id
  )
  WHERE samsara_vehicle_id IS NOT NULL;

COMMIT;
