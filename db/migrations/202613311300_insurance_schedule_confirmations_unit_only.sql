-- 202613311300_insurance_schedule_confirmations_unit_only.sql
-- Unit-only insurance schedule confirmations may log unit_id without a seated driver yet.
-- Idempotent additive: relax NOT NULL on driver_id; keep append-only confirmations table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'insurance'
      AND table_name = 'schedule_confirmations'
      AND column_name = 'driver_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE insurance.schedule_confirmations
      ALTER COLUMN driver_id DROP NOT NULL;
  END IF;
END $$;
