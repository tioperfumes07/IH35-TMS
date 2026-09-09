-- 202614020000_notifications_type_check_insurance_widen.sql
-- ROOT CAUSE (measured live, Neon prod br-fancy-credit-akjnd07a, RLS-bypassed):
--   /api/v1/healthz's background_jobs.stale (warning tier) reports insurance.monthly_report_by_5th
--   as never_succeeded. PR #21200 fixed the SECONDARY symptom (one company's failed notification
--   INSERT poisoned the whole shared transaction, masking the real error as "current transaction is
--   aborted, commands ignored until end of transaction block") by isolating each company into its own
--   transaction. The REAL, still-live first error underneath: notifications.user_notifications_type_check
--   only allows ('compliance_expiring','compliance_expired','maintenance_alert','load_status',
--   'driver_alert','system','message') -- but insurance-monthly-report.cron.ts inserts
--   type='insurance_monthly_report' (and, on its own error path, 'insurance_monthly_report_error').
--   Both values are already declared in the TS NotificationType union
--   (apps/backend/src/notifications/notification.service.ts) -- the DB CHECK was simply never widened
--   to match, so every insert of those types still raises check_violation and the cron still never
--   succeeds. Confirmed live: live CHECK constraint (pg_get_constraintdef) matches the narrower list
--   above exactly; the table currently holds only 'system'-typed rows (203,477 of them) system-wide,
--   so this widen cannot invalidate any existing row.
--
-- FIX: widen the CHECK to the full reproduced superset + the two insurance types. Additive (only
-- widens the accepted set -- no existing row can violate a superset), idempotent (DROP IF EXISTS then
-- ADD, safe to re-run). Same shape as 202613301900 (sync_alerts severity CHECK add 'error') and
-- 202613990000 (reconciliation_findings_finding_type_check widen). CREATE-only spirit, never drops a
-- table, never deletes a row. From the staged draft
-- docs/audit/migration-drafts/NOTIFICATIONS-TYPE-CHECK-INSURANCE-REPORT-WIDEN-migration-draft.sql
-- (Cursor 2026-09-06), routed via PR #21200's own REMAINING note.
BEGIN;

ALTER TABLE notifications.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE notifications.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (type = ANY (ARRAY[
    'compliance_expiring',
    'compliance_expired',
    'maintenance_alert',
    'load_status',
    'driver_alert',
    'system',
    'message',
    'insurance_monthly_report',
    'insurance_monthly_report_error'
  ]::text[]));

COMMIT;
