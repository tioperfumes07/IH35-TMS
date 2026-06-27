-- Block 03 #2 — Add odometer_mi to mdata.units
-- Source: Samsara obdOdometerMeters stat (meters) × 0.000621371 → miles, 1 dp.
-- No backfill — the Samsara daily sync writes this on next run.
-- Additive, non-financial, auto-merge on green.

BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.units') IS NOT NULL THEN
    ALTER TABLE mdata.units
      ADD COLUMN IF NOT EXISTS odometer_mi NUMERIC(8,1);
  END IF;
END $$;

COMMIT;
