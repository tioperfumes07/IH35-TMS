-- FK integrity closures — Law-of-the-Land connectivity sweep (telematics/safety/compliance,
-- NOT money/GL). HOLD-FOR-JORGE: migration → financial-cluster gate applies to ALL migrations.
-- =================================================================================================
-- FINDING 1: maintenance.samsara_fault_code_history (migration 0310) has:
--   unit_id     UUID NOT NULL  -- indexed, but no FK -> mdata.units(id)
--   auto_wo_id  UUID           -- no FK -> maintenance.work_orders(id)
-- Without these, a fault-history row can orphan from its unit or its auto-generated work order,
-- breaking the predictive-maintenance chain (fault -> unit -> auto-WO).
--
-- FINDING 2: safety.da_test_records + safety.da_program_enrollments (migration 0327, RLS in 0406)
-- have driver_uuid UUID NOT NULL with no FK -> mdata.drivers(id). These are FMCSA Part 382
-- Clearinghouse records (drug/alcohol test results, consortium enrollment) — must not orphan
-- from the driver they document.
--
-- SKIPPED: dispatch.border_crossing_events driver_uuid/load_uuid FKs — already added by
-- migration 202607051215_e2_3_border_crossing_events_integrity.sql (PR #2126, MERGED 2026-07-05).
-- That migration also converted operating_company_id TEXT->uuid and re-asserted FORCE RLS/grants.
-- Nothing left to do there; vehicle_id is intentionally left unconstrained (Samsara external id).
--
-- WHAT THIS MIGRATION DOES (additive / integrity only — NO money, NO GL, NO posting):
--   1. Add fk_fault_history_unit     : maintenance.samsara_fault_code_history.unit_id -> mdata.units(id)
--   2. Add fk_fault_history_auto_wo  : maintenance.samsara_fault_code_history.auto_wo_id -> maintenance.work_orders(id)
--   3. Add fk_da_test_records_driver : safety.da_test_records.driver_uuid -> mdata.drivers(id)
--   4. Add fk_da_enrollments_driver  : safety.da_program_enrollments.driver_uuid -> mdata.drivers(id)
-- All four are created NOT VALID (guarded by pg_constraint existence + to_regclass presence) so the
-- migration can never fail on pre-existing drift rows; new writes are fully checked from here on.
-- RLS posture and grants on these tables are UNCHANGED (out of scope for this migration) — this
-- only adds referential integrity.
--
-- IDEMPOTENT: every ALTER TABLE ... ADD CONSTRAINT is guarded by a pg_constraint existence check
-- inside a DO $$ block; safe to re-run any number of times.
--
-- BACKFLAG (needs Jorge): all four FKs are NOT VALID. A follow-up `ALTER TABLE ... VALIDATE
-- CONSTRAINT ...` pass should be run (in a low-traffic window) after confirming there are no
-- pre-existing orphan rows (unit_id/auto_wo_id/driver_uuid pointing at a deleted/absent row) on
-- prod. This migration does NOT query or mutate prod data — validation must happen separately,
-- read-only first, per §1.5 (prod DB access is gated).
-- =================================================================================================

BEGIN;

DO $$
BEGIN
  -- ── 1. maintenance.samsara_fault_code_history.unit_id -> mdata.units(id) ─────────────────────
  IF to_regclass('maintenance.samsara_fault_code_history') IS NOT NULL
     AND to_regclass('mdata.units') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_fault_history_unit'
         AND conrelid = 'maintenance.samsara_fault_code_history'::regclass
     ) THEN
    ALTER TABLE maintenance.samsara_fault_code_history
      ADD CONSTRAINT fk_fault_history_unit
      FOREIGN KEY (unit_id) REFERENCES mdata.units(id)
      NOT VALID;
  END IF;

  -- ── 2. maintenance.samsara_fault_code_history.auto_wo_id -> maintenance.work_orders(id) ───────
  IF to_regclass('maintenance.samsara_fault_code_history') IS NOT NULL
     AND to_regclass('maintenance.work_orders') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_fault_history_auto_wo'
         AND conrelid = 'maintenance.samsara_fault_code_history'::regclass
     ) THEN
    ALTER TABLE maintenance.samsara_fault_code_history
      ADD CONSTRAINT fk_fault_history_auto_wo
      FOREIGN KEY (auto_wo_id) REFERENCES maintenance.work_orders(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- ── 3. safety.da_test_records.driver_uuid -> mdata.drivers(id) ────────────────────────────────
  IF to_regclass('safety.da_test_records') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_da_test_records_driver'
         AND conrelid = 'safety.da_test_records'::regclass
     ) THEN
    ALTER TABLE safety.da_test_records
      ADD CONSTRAINT fk_da_test_records_driver
      FOREIGN KEY (driver_uuid) REFERENCES mdata.drivers(id)
      NOT VALID;
  END IF;

  -- ── 4. safety.da_program_enrollments.driver_uuid -> mdata.drivers(id) ─────────────────────────
  IF to_regclass('safety.da_program_enrollments') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_da_enrollments_driver'
         AND conrelid = 'safety.da_program_enrollments'::regclass
     ) THEN
    ALTER TABLE safety.da_program_enrollments
      ADD CONSTRAINT fk_da_enrollments_driver
      FOREIGN KEY (driver_uuid) REFERENCES mdata.drivers(id)
      NOT VALID;
  END IF;
END
$$;

COMMIT;
