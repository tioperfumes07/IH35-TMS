BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS qbo_class_id text;

CREATE INDEX IF NOT EXISTS idx_mdata_drivers_qbo_class
  ON mdata.drivers (qbo_class_id)
  WHERE qbo_class_id IS NOT NULL;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text;

CREATE INDEX IF NOT EXISTS idx_mdata_units_q_vendor
  ON mdata.units (qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;

COMMIT;
