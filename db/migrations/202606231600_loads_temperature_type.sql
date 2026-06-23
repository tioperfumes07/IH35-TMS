-- W-FIX-1 ([HOLD-FOR-JORGE]) — Reefer "Temperature type" (Frozen / Fresh) for Book Load §B + side panel.
-- The reefer panel asks Temperature type FIRST, then Reefer temperature (°F, the single setpoint = reefer_temp_f
-- which already exists, mig 202606231400). Additive, nullable, idempotent. No data change. mdata is in the
-- 0065 GRANT set + DEFAULT PRIVILEGES, so the new column inherits ih35_app grants — no new GRANT.
DO $$
BEGIN
  ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS temperature_type TEXT;
  ALTER TABLE mdata.loads DROP CONSTRAINT IF EXISTS chk_loads_temperature_type;
  ALTER TABLE mdata.loads
    ADD CONSTRAINT chk_loads_temperature_type CHECK (temperature_type IS NULL OR temperature_type IN ('frozen', 'fresh'));
END $$;

COMMENT ON COLUMN mdata.loads.temperature_type IS 'render-A §B reefer: Frozen | Fresh (asked before the reefer setpoint temperature)';
