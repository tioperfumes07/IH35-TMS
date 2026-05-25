BEGIN;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS samsara_vehicle_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdata_units_company_samsara_vehicle
  ON mdata.units (
    COALESCE(currently_leased_to_company_id, owner_company_id),
    samsara_vehicle_id
  )
  WHERE samsara_vehicle_id IS NOT NULL;

COMMIT;
