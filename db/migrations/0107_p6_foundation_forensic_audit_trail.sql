BEGIN;

CREATE TABLE IF NOT EXISTS qbo_archive.import_batch_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  batch_id uuid NOT NULL REFERENCES qbo_archive.import_batches(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
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
    'batch_auto_failed_stale'
  )),
  entity_type text,
  page_number int,
  total_pages int,
  records_processed int,
  duration_ms int,
  error_message text,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qbo_archive.import_batch_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_batch_audit_isolation ON qbo_archive.import_batch_audit_log;
CREATE POLICY rls_batch_audit_isolation ON qbo_archive.import_batch_audit_log
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_batch_audit_batch
  ON qbo_archive.import_batch_audit_log (batch_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_audit_event_type
  ON qbo_archive.import_batch_audit_log (event_type, occurred_at DESC);

COMMIT;
