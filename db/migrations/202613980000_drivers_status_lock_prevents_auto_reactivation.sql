-- DRV-STATUS-LOCK-PREVENTS-AUTO-REACTIVATION (owner report 2026-09-07, recurring regression):
-- "DRIVERS IS STILL SHOWING ALL THOSE DRIVERS AS ACTIVE... I DEACTIVATED MANY DRIVERS IN SAMSARA...
-- WE SHOULD ONLY HAVE AROUND 30." Live-confirmed on prod (audit.row_changes, mdata.drivers):
-- the daily cron `mdata.driver_active_30d` (apps/backend/src/jobs/driver-active-30d-worker.ts,
-- 05:15 UTC) flips 70-90+ USMCA drivers Active<->Inactive on many single nights (91 reactivated
-- 2026-09-01, 74 reactivated 2026-09-05, etc.) -- its REACTIVATE branch
-- (driver-active-30d.service.ts) treats ANY `deactivated_at IS NOT NULL` row as eligible for
-- reactivation the moment the 30-day activity predicate matches again (a stale load's `updated_at`
-- getting touched by an unrelated process is enough), with zero distinction between "this job
-- auto-deactivated it for inactivity" and "the owner deliberately deactivated this driver (in
-- Samsara or in the TMS app) for a real business reason." USMCA currently sits at 89 Active / 75
-- Inactive against the owner's ~30 expectation as a direct result.
--
-- Fix (this migration, additive only): a distinct lock the sync must respect and never silently
-- clear. `status_locked_at` being non-NULL means "do not auto-reactivate this driver without a
-- real external signal" -- set by (a) the manual /deactivate route, (b) the Samsara driver-mirror
-- collector observing driverActivationStatus='deactivated' for a linked driver. Cleared by (a) the
-- manual /reactivate route, (b) the same collector observing the driver active again in Samsara
-- (only when the lock's own reason is 'samsara_deactivated' -- never overrides a human's manual
-- lock). The 30d-activity job's own auto-deactivate path never sets this lock, so a driver it
-- deactivates for pure inactivity remains eligible for its own future auto-reactivation, same as
-- today -- only an owner-sourced deactivation (manual or Samsara) becomes sticky.
BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS status_locked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS status_locked_reason text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drivers_status_locked_reason_check'
  ) THEN
    ALTER TABLE mdata.drivers
      ADD CONSTRAINT drivers_status_locked_reason_check
      CHECK (status_locked_reason IS NULL OR status_locked_reason IN ('manual_deactivate', 'samsara_deactivated'));
  END IF;
END $$;

COMMENT ON COLUMN mdata.drivers.status_locked_at IS
  'Non-NULL means an owner-sourced deactivation (manual TMS action or Samsara) is in effect -- the daily mdata.driver_active_30d cron (driver-active-30d.service.ts) must never auto-reactivate this driver while set, regardless of load/telematics activity. Cleared only by the matching manual reactivate action or by the Samsara collector observing the driver active again (when locked for that same reason).';
COMMENT ON COLUMN mdata.drivers.status_locked_reason IS
  'Why status_locked_at is set: manual_deactivate (owner used the TMS /deactivate action) or samsara_deactivated (Samsara driver-mirror collector observed driverActivationStatus=deactivated for this linked driver).';

CREATE INDEX IF NOT EXISTS idx_drivers_status_locked_at ON mdata.drivers (status_locked_at) WHERE status_locked_at IS NOT NULL;

COMMIT;
