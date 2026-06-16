-- GO-LIVE DATA-TRUTH (Block 1B): driver deactivation status consistency.
-- Source of truth for active/inactive = deactivated_at. A deactivated driver must NEVER read 'Active'.
-- Measured on prod: 1 driver (Juan Manuel Saldana) had status='Active' AND deactivated_at set since
-- 2026-06-07 — desynced by a PATCH that set deactivated_at without updating status. Such a driver shows
-- Active in the UI, counts toward Active/Available KPIs, and stays assignable in dispatch dropdowns.
--
-- This migration (a) reconciles existing desync, and (b) adds a CHECK so the two fields can NEVER
-- disagree again (the DB-level "every bug gets a guard"). The driver_status enum is
-- {Active, Probation, Inactive, Terminated, OnLeave}; deactivated => Inactive or Terminated.
--
-- mdata only — disjoint from Path B (catalogs.accounts / accounting.* / finance.*).
-- Note: mdata.units.status is OPERATIONAL (InService/OutOfService/InMaintenance/Sold/...), not
-- active/inactive, so units cannot desync this way; unit active-fleet truth is deactivated_at and is
-- enforced at the query layer (dropdowns/KPIs filter deactivated_at IS NULL), not by a CHECK here.
--
-- Idempotent. Reversible: DROP CONSTRAINT chk_drivers_status_deactivated_consistent.

BEGIN;

-- (a) Reconcile: any deactivated driver still carrying an active-ish status -> Inactive.
UPDATE mdata.drivers
   SET status = 'Inactive', updated_at = now()
 WHERE deactivated_at IS NOT NULL
   AND status NOT IN ('Inactive', 'Terminated');

-- (b) Permanent guard: deactivated_at set => status must be a deactivated status.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_drivers_status_deactivated_consistent'
      AND conrelid = 'mdata.drivers'::regclass
  ) THEN
    ALTER TABLE mdata.drivers
      ADD CONSTRAINT chk_drivers_status_deactivated_consistent
      CHECK (deactivated_at IS NULL OR status IN ('Inactive', 'Terminated'));
  END IF;
END $$;

COMMIT;
