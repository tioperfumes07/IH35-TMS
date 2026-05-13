BEGIN;

-- Allow dedicated forensic import error audit rows (queryable error_message + rich metadata).
ALTER TABLE qbo_archive.import_batch_audit_log
  DROP CONSTRAINT IF EXISTS import_batch_audit_log_event_type_check;

ALTER TABLE qbo_archive.import_batch_audit_log
  ADD CONSTRAINT import_batch_audit_log_event_type_check CHECK (event_type IN (
    'batch_started',
    'preflight_qbo_check_passed',
    'preflight_qbo_check_failed',
    'entities_phase_started',
    'entities_phase_completed',
    'entity_type_started',
    'entity_type_completed',
    'transactions_phase_started',
    'transactions_phase_completed',
    'txn_type_started',
    'txn_type_completed',
    'attachments_phase_started',
    'attachments_phase_completed',
    'attachment_downloaded',
    'page_fetched',
    'qbo_retry',
    'error_encountered',
    'batch_completed',
    'batch_failed',
    'batch_auto_failed_stale',
    'forensic_import_error'
  ));

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    SELECT 'forensic_import_error'
    WHERE NOT EXISTS (
      SELECT 1 FROM audit.allowed_event_classes WHERE event_class = 'forensic_import_error'
    );
  END IF;
END
$$;

COMMIT;
