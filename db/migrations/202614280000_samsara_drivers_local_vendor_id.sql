-- 202614280000_samsara_drivers_local_vendor_id.sql
--
-- E20 Part A, step 1 (Lead spec, 2026-09-23): integrations.samsara_drivers.local_driver_id is
-- the mapping column ("MANY PROFILES -> ONE DRIVER" -- deliberately no unique constraint on it,
-- one driver may legitimately have 2+ Samsara profiles). This migration adds the polymorphic
-- sibling the owner ordered: "An owner-operator paid as a vendor is not on driver payroll." A
-- Samsara profile may map to a driver OR a vendor, never both.
--
-- Additive only. No backfill of local_driver_id/local_vendor_id in this migration -- see this
-- session's own measurement (docs/bus/, OUTBOX-CC-1.md): of the 94 mdata.drivers rows in USMCA
-- carrying the legacy samsara_driver_id scalar, 66 already agree with an existing
-- samsara_drivers.local_driver_id mapping, but 28 conflict -- the SAME samsara_driver_id value
-- is associated with TWO DIFFERENT mdata.drivers rows for what is, in every one of the 28 cases
-- checked, the identical driver name (a live duplicate-driver-identity problem, exactly what
-- E20 exists to fix, not a schema gap this migration can silently resolve). One of the 28 is a
-- currently ACTIVE driver (GENARO GUERRERO CHAVEZ, two live rows: 6edcb351-e81b-4bf2-adf7-
-- 5eca9eff9137 created 2026-07-04 and 6e908ee1-c626-4aae-83c0-4b1e4e0f683b created 2026-08-21).
-- Per the spec's own law -- "NEVER AUTO-MAP" -- backfilling into a conflict would be exactly
-- that. The 66 clean rows are backfilled in a separate, later step after this column exists;
-- the 28 conflicts are reported, not resolved, here.
DO $$
BEGIN
  IF to_regclass('integrations.samsara_drivers') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='integrations' AND table_name='samsara_drivers' AND column_name='local_vendor_id'
  ) THEN
    ALTER TABLE integrations.samsara_drivers ADD COLUMN local_vendor_id uuid;
    COMMENT ON COLUMN integrations.samsara_drivers.local_vendor_id IS
      'Polymorphic sibling to local_driver_id (E20, 2026-09-23 owner ruling): a Samsara profile '
      'may map to a driver OR a vendor (an owner-operator paid as a vendor, not on driver '
      'payroll), never both -- enforced by ck_samsara_drivers_one_target below. No unique '
      'constraint deliberately: one vendor may also have multiple Samsara profiles (fleet of '
      'owner-operator trucks under one vendor entity).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'samsara_drivers_local_vendor_id_fkey'
  ) THEN
    ALTER TABLE integrations.samsara_drivers
      ADD CONSTRAINT samsara_drivers_local_vendor_id_fkey FOREIGN KEY (local_vendor_id) REFERENCES mdata.vendors(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_samsara_drivers_one_target'
  ) THEN
    ALTER TABLE integrations.samsara_drivers
      ADD CONSTRAINT ck_samsara_drivers_one_target
      CHECK (local_driver_id IS NULL OR local_vendor_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='integrations' AND tablename='samsara_drivers' AND indexname='idx_samsara_drivers_local_vendor_id'
  ) THEN
    CREATE INDEX idx_samsara_drivers_local_vendor_id ON integrations.samsara_drivers(local_vendor_id) WHERE local_vendor_id IS NOT NULL;
  END IF;
END $$;
