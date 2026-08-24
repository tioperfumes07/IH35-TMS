-- FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): mdata.units, mdata.customers, mdata.vendors,
-- mdata.drivers and mdata.loads all got is_sample_data in migration 0403; mdata.equipment (trailers)
-- was never included, so a fixture trailer (e.g. "CODEX-LEGAL-TRAILER-...") cannot be excluded from
-- the live Fleet roster/KPI surfaces the way a fixture truck now can (#15082/#15084). Additive-only.
BEGIN;

ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_mdata_equipment_sample_data
  ON mdata.equipment (owner_company_id, is_sample_data);

COMMIT;
