-- CLAIM 202615230100 — ROUND 326 audit M2 (CC-1): one PM-due evaluator.
--
-- The PM auto engine reads maintenance.pm_schedules, which carries interval_kind / interval_value and an ODOMETER
-- baseline (last_service_odometer / next_due_odometer) but NO last-service date — so a days-based PM could never be
-- evaluated and never auto-created a work order, while the UI evaluates the same PM by date (evaluatePmDue).
-- This adds the date the engine needs; nothing is backfilled (BUILD-ONLY law) — completing a PM work order and the
-- service-history backfill stamp it going forward.
--
-- LIVE (read-only, br-fancy-credit-akjnd07a, 2026-10-02): maintenance.pm_schedules has no last_service_date.
-- Additive · idempotent · nullable · no DROP · CC-1 HH 00–05.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE maintenance.pm_schedules
  ADD COLUMN IF NOT EXISTS last_service_date date NULL;

COMMENT ON COLUMN maintenance.pm_schedules.last_service_date IS
  'ROUND 326 M2: date the PM was last performed (stamped when its PM work order completes or by the service-history backfill). Days-interval PMs are due at last_service_date + interval_value days (evaluatePmDue).';

COMMIT;
