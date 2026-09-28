-- 202614420000_mdata_drivers_merged_into_driver_id.sql
--
-- CC-1, 2026-09-28. ROUND 148 (driver map) requires retiring a duplicate driver profile to
-- status=Inactive "with a merged_into pointer (NEVER deleted)". Verified live on prod
-- (information_schema.columns, mdata.drivers, 88 columns) that no such column exists — the
-- order's own text assumed a mechanism that isn't there. This is the additive fix: a nullable
-- self-referencing FK so a merged loser's profile durably points at its survivor without any
-- delete, alongside the existing audit.audit_events trail the merge script already writes.
--
-- Idempotent, additive only. No RLS change needed (column, not table).

DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NULL THEN
    RAISE NOTICE '202614420000: mdata.drivers absent — skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'mdata' AND table_name = 'drivers' AND column_name = 'merged_into_driver_id'
  ) THEN
    ALTER TABLE mdata.drivers
      ADD COLUMN merged_into_driver_id uuid REFERENCES mdata.drivers(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'mdata' AND tablename = 'drivers' AND indexname = 'idx_drivers_merged_into_driver_id'
  ) THEN
    CREATE INDEX idx_drivers_merged_into_driver_id
      ON mdata.drivers (merged_into_driver_id)
      WHERE merged_into_driver_id IS NOT NULL;
  END IF;
END $$;
