-- FINDING: ACCT-F11121 — a cached Samsara position outlives its unit and stops the auto-status engine.
--
-- MEASURED (prod, 2026-11-09 19:00 CT):
--   _system.background_jobs integrations.auto_status_switch_worker: last success 2026-11-03 16:05:02Z, failing every
--   5 minutes since with: insert or update on table "auto_status_position_snapshots" violates foreign key constraint
--   "auto_status_position_snapshots_unit_uuid_fkey".
--   integrations.samsara_vehicle_positions: 129 rows, 10 with a unit_uuid that is not in mdata.units (USMCA 3:
--   0a101026…, 328c0bf1…, 7350df2b…; other entities 7) — the phantom SAM-/gateway units purged 2026-11-03 (pending
--   row 258); every orphan last recorded 2026-08-31 22:35:51Z.
--
-- ROOT CAUSE: samsara_vehicle_positions.unit_uuid has no foreign key, so deleting a unit left its cached position
-- behind; integrations.auto_status_position_snapshots (FK ON DELETE CASCADE, 202606080215) refused the copy and the
-- whole tick rolled back.
--
-- FIX: the same rule the snapshot table already has — the cached position belongs to its unit and goes with it
-- (ON DELETE CASCADE). NOT VALID: enforced for every new write and every future unit delete; the 10 existing orphan
-- cache rows are not touched here (7 belong to frozen entities). The snapshot reader joins mdata.units, so they are
-- never read (apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts).
--
-- This migration writes NO rows. IDEMPOTENT: constraint guarded by name.

BEGIN;

SET LOCAL lock_timeout = '15s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'samsara_vehicle_positions_unit_uuid_fkey'
       AND conrelid = 'integrations.samsara_vehicle_positions'::regclass
  ) THEN
    ALTER TABLE integrations.samsara_vehicle_positions
      ADD CONSTRAINT samsara_vehicle_positions_unit_uuid_fkey
      FOREIGN KEY (unit_uuid) REFERENCES mdata.units(id) ON DELETE CASCADE NOT VALID;
  END IF;
END$$;

COMMENT ON CONSTRAINT samsara_vehicle_positions_unit_uuid_fkey ON integrations.samsara_vehicle_positions IS
  'ACCT-F11121: a cached position belongs to its unit and is removed with it. NOT VALID — 10 orphan rows from the 2026-11-03 phantom-unit purge pre-date it.';

COMMIT;
