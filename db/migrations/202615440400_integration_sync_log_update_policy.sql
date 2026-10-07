-- 202615440400_integration_sync_log_update_policy.sql
-- CC-1 · RELAY-F440 — a Relay tick can record that it finished.
--
-- integrations.integration_sync_log has row-level security FORCED with two policies: INSERT
-- (integration_sync_log_insert_bypass) and SELECT (integration_sync_log_select_office). There was no UPDATE
-- policy, so the Relay cron's completion write (finishRelayTick: UPDATE ... SET finished_at, success, error_message,
-- payload) matched ZERO rows. Postgres does not raise on that; it reports UPDATE 0. Measured 2026-10-07 on prod: 14
-- relay_fuel_daily_pull ticks since 2026-10-01, finished_at NULL and success NULL on every one, no error_message, no
-- Sentry issue. Meanwhile the audit trail shows the ticks ran (2,391 daily_pull events, 101 daily_pull_failed). The
-- claim row was written and could never be closed.
--
-- 1. UPDATE policy for the system path only (identity.is_lucia_bypass(), the same predicate the INSERT policy admits
--    for background jobs). Office users read the log; they never edit it.
-- 2. Close every claim that never recorded a finish and is older than 2 hours: success=false plus the reason. Those
--    runs did happen. Their outcome is in audit.audit_events, not here, and the row says so instead of staying silent.
--    Idempotent: a second run finds no open claim older than 2 hours.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'integrations.integration_sync_log'::regclass AND polname = 'integration_sync_log_update_bypass'
  ) THEN
    CREATE POLICY integration_sync_log_update_bypass ON integrations.integration_sync_log
      FOR UPDATE
      USING (identity.is_lucia_bypass())
      WITH CHECK (identity.is_lucia_bypass());
  END IF;
END $$;

UPDATE integrations.integration_sync_log
   SET finished_at = now(),
       success = false,
       error_message = 'abandoned: the completion write was refused (integration_sync_log had no UPDATE policy until '
                       || '202615440400); this run''s outcome is in audit.audit_events (source RELAY-FUEL-INGEST-1)'
 WHERE finished_at IS NULL
   AND started_at < now() - interval '2 hours';
