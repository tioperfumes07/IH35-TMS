-- P7 Wave 2 v3 — integrations.qbo_sync_queue extensions + dead_letter status.

BEGIN;

ALTER TABLE integrations.qbo_sync_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payload_jsonb jsonb,
  ADD COLUMN IF NOT EXISTS triggered_by text;

DO $$
DECLARE
  status_constraint text;
BEGIN
  IF to_regclass('integrations.qbo_sync_queue') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
  INTO status_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'integrations'
    AND t.relname = 'qbo_sync_queue'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%sync_status%';

  IF status_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE integrations.qbo_sync_queue DROP CONSTRAINT %I', status_constraint);
  END IF;

  ALTER TABLE integrations.qbo_sync_queue
    ADD CONSTRAINT qbo_sync_queue_sync_status_check
    CHECK (sync_status IN ('pending', 'in_flight', 'synced', 'failed', 'blocked', 'dead_letter'));
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qbo_sync_queue_triggered_by_check') THEN
    IF to_regclass('integrations.qbo_sync_queue') IS NOT NULL THEN
      ALTER TABLE integrations.qbo_sync_queue
        ADD CONSTRAINT qbo_sync_queue_triggered_by_check
        CHECK (
          triggered_by IS NULL
          OR triggered_by IN (
            'tms_user',
            'tms_system',
            'webhook_replay',
            'manual_retry',
            'cdc_poll'
          )
        );
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qbo_sync_queue_company_idempotency
  ON integrations.qbo_sync_queue (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
