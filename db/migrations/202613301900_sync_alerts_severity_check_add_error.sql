-- FIX: sync_alerts severity CHECK constraint only allowed info/warning/critical.
-- Code inserts 'error' severity (journal-entry-qbo-push.service.ts, sync-with-retry.ts).
-- Additive: ALTER CONSTRAINT to include 'error' in the allowed values.
-- Also fixes schema drift: code used entity_type/error_message columns that don't exist
-- in the live table (live uses kind/message). Code fixed to use live column names.

BEGIN;

ALTER TABLE qbo.sync_alerts
  DROP CONSTRAINT IF EXISTS sync_alerts_severity_check,
  ADD CONSTRAINT sync_alerts_severity_check
    CHECK (severity IN ('info', 'warning', 'error', 'critical'));

COMMIT;
