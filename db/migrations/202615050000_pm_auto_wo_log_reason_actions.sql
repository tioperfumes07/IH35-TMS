-- 202615050000_pm_auto_wo_log_reason_actions.sql
-- E-14 PM auto-engine (ORDERS 2026-10-01, CC-1 row 1). Two honest per-unit outcomes the log could not
-- record:
--   skipped_no_baseline -- the schedule has no real last-service odometer (NULL or the <= 1 placeholder)
--                          or is a days-interval with no last-service date. Never a guessed baseline.
--   due_wo_flag_off     -- the unit is due, but work-order creation is behind
--                          PM_AUTO_ENGINE_CREATE_WORK_ORDERS (flag-OFF: a work order is a business record).
-- Additive: the CHECK only widens; every existing row stays valid. NOT VALID + VALIDATE keeps the
-- lock short (VALIDATE takes SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE).

BEGIN;

ALTER TABLE maintenance.pm_auto_wo_log DROP CONSTRAINT IF EXISTS pm_auto_wo_log_action_check;
ALTER TABLE maintenance.pm_auto_wo_log
  ADD CONSTRAINT pm_auto_wo_log_action_check CHECK (action = ANY (ARRAY[
    'wo_created', 'alert_created', 'near_due_alert', 'skipped_paused', 'skipped_open_wo',
    'skipped_no_odometer', 'skipped_no_baseline', 'due_wo_flag_off'
  ])) NOT VALID;
ALTER TABLE maintenance.pm_auto_wo_log VALIDATE CONSTRAINT pm_auto_wo_log_action_check;

COMMIT;
