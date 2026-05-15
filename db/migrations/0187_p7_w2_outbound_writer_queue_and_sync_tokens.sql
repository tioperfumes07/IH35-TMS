-- P7 Wave 2 close-out — outbound writers: queue entity types + TMS SyncToken columns.

BEGIN;

ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.bill_payments
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.payments
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.credit_memos
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.factoring_advances
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE integrations.qbo_sync_queue DROP CONSTRAINT IF EXISTS qbo_sync_queue_triggered_by_check;

ALTER TABLE integrations.qbo_sync_queue
  ADD CONSTRAINT qbo_sync_queue_triggered_by_check
  CHECK (
    triggered_by IS NULL
    OR triggered_by IN (
      'tms_user',
      'tms_system',
      'webhook_replay',
      'manual_retry',
      'cdc_poll',
      'recurring_template'
    )
  );

DO $$
DECLARE
  entity_type_constraint text;
BEGIN
  IF to_regclass('integrations.qbo_sync_queue') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
  INTO entity_type_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'integrations'
    AND t.relname = 'qbo_sync_queue'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%';

  IF entity_type_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE integrations.qbo_sync_queue DROP CONSTRAINT %I', entity_type_constraint);
  END IF;

  ALTER TABLE integrations.qbo_sync_queue
    ADD CONSTRAINT qbo_sync_queue_entity_type_check
    CHECK (
      entity_type IN (
        'bank_transaction',
        'bill',
        'bill_payment',
        'expense',
        'invoice',
        'journal_entry',
        'payment',
        'credit_memo',
        'factoring_advance',
        'settlement',
        'transfer'
      )
    );
END
$$;

COMMIT;
