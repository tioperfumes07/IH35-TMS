BEGIN;

CREATE SCHEMA IF NOT EXISTS integrations;

CREATE TABLE IF NOT EXISTS integrations.qbo_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('bank_transaction', 'bill', 'expense', 'invoice', 'journal_entry')),
  entity_id uuid NOT NULL,
  qbo_realm_id text NOT NULL,
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'in_flight', 'synced', 'failed', 'blocked')),
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  qbo_id text,
  qbo_sync_token text,
  error_message text,
  error_details jsonb,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_qbo_sync_queue_company_status_next_attempt
  ON integrations.qbo_sync_queue (operating_company_id, sync_status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_qbo_sync_queue_entity_pending
  ON integrations.qbo_sync_queue (entity_type, entity_id)
  WHERE sync_status <> 'synced';

CREATE UNIQUE INDEX IF NOT EXISTS uq_qbo_sync_queue_active_entity
  ON integrations.qbo_sync_queue (operating_company_id, entity_type, entity_id)
  WHERE sync_status IN ('pending', 'in_flight', 'failed');

ALTER TABLE integrations.qbo_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_sync_queue_company_scope ON integrations.qbo_sync_queue;
CREATE POLICY qbo_sync_queue_company_scope
  ON integrations.qbo_sync_queue
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON integrations.qbo_sync_queue TO ih35_app;

COMMIT;

