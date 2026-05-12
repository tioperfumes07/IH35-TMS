BEGIN;

-- ---------------------------------------------------------------------------
-- A) Runtime-critical columns from manual hotfix reconciliation
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS mdata.loads
  ADD COLUMN IF NOT EXISTS team_id uuid;

ALTER TABLE IF EXISTS mdata.customers
  ADD COLUMN IF NOT EXISTS fmcsa_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS fmcsa_check_response jsonb;

ALTER TABLE IF EXISTS mdata.drivers
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id),
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text,
  ADD COLUMN IF NOT EXISTS qbo_vendor_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_vendor_linked_by_user_id uuid REFERENCES identity.users(id);

-- ---------------------------------------------------------------------------
-- B) qbo_archive schema and forensic archive tables
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS qbo_archive;

CREATE TABLE IF NOT EXISTS qbo_archive.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_realm_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_heartbeat_at timestamptz,
  entities_imported int NOT NULL DEFAULT 0,
  transactions_imported int NOT NULL DEFAULT 0,
  attachments_imported int NOT NULL DEFAULT 0,
  errors_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','failed','partial','paused')),
  jorge_signed_off_at timestamptz,
  jorge_signed_off_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qbo_archive.import_batches
  ADD COLUMN IF NOT EXISTS last_error_message text;

CREATE TABLE IF NOT EXISTS qbo_archive.entities_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_realm_id text NOT NULL,
  qbo_entity_type text NOT NULL,
  qbo_entity_id text NOT NULL,
  qbo_active_at_snapshot boolean NOT NULL,
  raw_snapshot jsonb NOT NULL,
  snapshot_taken_at timestamptz NOT NULL DEFAULT now(),
  snapshot_batch_id uuid NOT NULL REFERENCES qbo_archive.import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qbo_realm_id, qbo_entity_type, qbo_entity_id, snapshot_batch_id)
);

CREATE TABLE IF NOT EXISTS qbo_archive.transactions_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_realm_id text NOT NULL,
  qbo_txn_type text NOT NULL,
  qbo_txn_id text NOT NULL,
  txn_date date NOT NULL,
  total_cents bigint,
  raw_snapshot jsonb NOT NULL,
  attachments_count int NOT NULL DEFAULT 0,
  embezzlement_window boolean GENERATED ALWAYS AS (
    txn_date >= DATE '2023-01-01' AND txn_date <= DATE '2024-12-31'
  ) STORED,
  forensic_flags text[] NOT NULL DEFAULT '{}',
  snapshot_taken_at timestamptz NOT NULL DEFAULT now(),
  snapshot_batch_id uuid NOT NULL REFERENCES qbo_archive.import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qbo_realm_id, qbo_txn_type, qbo_txn_id, snapshot_batch_id)
);

CREATE TABLE IF NOT EXISTS qbo_archive.attachments_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  txn_snapshot_id uuid REFERENCES qbo_archive.transactions_snapshot(id),
  qbo_attachment_id text NOT NULL,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  r2_object_key text NOT NULL,
  checksum_sha256 text NOT NULL,
  uploaded_at_qbo timestamptz,
  snapshot_taken_at timestamptz NOT NULL DEFAULT now(),
  snapshot_batch_id uuid NOT NULL REFERENCES qbo_archive.import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qbo_archive.forensic_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  txn_snapshot_id uuid REFERENCES qbo_archive.transactions_snapshot(id),
  anomaly_type text NOT NULL,
  severity text NOT NULL DEFAULT 'review' CHECK (severity IN ('review','suspicious','critical')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid REFERENCES identity.users(id),
  reviewed_at timestamptz,
  review_status text CHECK (review_status IN ('pending','cleared','confirmed_issue','requires_legal')),
  review_notes text,
  snapshot_batch_id uuid NOT NULL REFERENCES qbo_archive.import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_qbo_import_batches_company_status
  ON qbo_archive.import_batches (operating_company_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qbo_entities_snapshot_company
  ON qbo_archive.entities_snapshot (operating_company_id, qbo_entity_type);
CREATE INDEX IF NOT EXISTS idx_qbo_transactions_snapshot_company_date
  ON qbo_archive.transactions_snapshot (operating_company_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_qbo_transactions_snapshot_flags
  ON qbo_archive.transactions_snapshot USING GIN (forensic_flags);
CREATE INDEX IF NOT EXISTS idx_qbo_attachments_snapshot_company
  ON qbo_archive.attachments_snapshot (operating_company_id, snapshot_batch_id);
CREATE INDEX IF NOT EXISTS idx_qbo_forensic_anomalies_company_status
  ON qbo_archive.forensic_anomalies (operating_company_id, review_status, severity);
CREATE INDEX IF NOT EXISTS idx_batch_audit_batch
  ON qbo_archive.import_batch_audit_log (batch_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_audit_event_type
  ON qbo_archive.import_batch_audit_log (event_type, occurred_at DESC);

ALTER TABLE qbo_archive.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.entities_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.transactions_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.attachments_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.forensic_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.import_batch_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_import_batches_company_scope ON qbo_archive.import_batches;
CREATE POLICY qbo_import_batches_company_scope
  ON qbo_archive.import_batches
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS qbo_entities_snapshot_company_scope ON qbo_archive.entities_snapshot;
CREATE POLICY qbo_entities_snapshot_company_scope
  ON qbo_archive.entities_snapshot
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS qbo_transactions_snapshot_company_scope ON qbo_archive.transactions_snapshot;
CREATE POLICY qbo_transactions_snapshot_company_scope
  ON qbo_archive.transactions_snapshot
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS qbo_attachments_snapshot_company_scope ON qbo_archive.attachments_snapshot;
CREATE POLICY qbo_attachments_snapshot_company_scope
  ON qbo_archive.attachments_snapshot
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS qbo_forensic_anomalies_company_scope ON qbo_archive.forensic_anomalies;
CREATE POLICY qbo_forensic_anomalies_company_scope
  ON qbo_archive.forensic_anomalies
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

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

CREATE OR REPLACE FUNCTION qbo_archive.prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'qbo_archive snapshot tables are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_qbo_entities_snapshot_no_update ON qbo_archive.entities_snapshot;
CREATE TRIGGER trg_qbo_entities_snapshot_no_update
  BEFORE UPDATE OR DELETE ON qbo_archive.entities_snapshot
  FOR EACH ROW EXECUTE FUNCTION qbo_archive.prevent_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_qbo_transactions_snapshot_no_update ON qbo_archive.transactions_snapshot;
CREATE TRIGGER trg_qbo_transactions_snapshot_no_update
  BEFORE UPDATE OR DELETE ON qbo_archive.transactions_snapshot
  FOR EACH ROW EXECUTE FUNCTION qbo_archive.prevent_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_qbo_attachments_snapshot_no_update ON qbo_archive.attachments_snapshot;
CREATE TRIGGER trg_qbo_attachments_snapshot_no_update
  BEFORE UPDATE OR DELETE ON qbo_archive.attachments_snapshot
  FOR EACH ROW EXECUTE FUNCTION qbo_archive.prevent_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_qbo_import_batches_no_delete ON qbo_archive.import_batches;
CREATE TRIGGER trg_qbo_import_batches_no_delete
  BEFORE DELETE ON qbo_archive.import_batches
  FOR EACH ROW EXECUTE FUNCTION qbo_archive.prevent_snapshot_mutation();

CREATE OR REPLACE FUNCTION qbo_archive.guard_forensic_anomaly_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.operating_company_id IS DISTINCT FROM NEW.operating_company_id)
     OR (OLD.txn_snapshot_id IS DISTINCT FROM NEW.txn_snapshot_id)
     OR (OLD.anomaly_type IS DISTINCT FROM NEW.anomaly_type)
     OR (OLD.severity IS DISTINCT FROM NEW.severity)
     OR (OLD.detected_at IS DISTINCT FROM NEW.detected_at)
     OR (OLD.snapshot_batch_id IS DISTINCT FROM NEW.snapshot_batch_id) THEN
    RAISE EXCEPTION 'Only forensic review fields are mutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qbo_forensic_anomalies_guard_update ON qbo_archive.forensic_anomalies;
CREATE TRIGGER trg_qbo_forensic_anomalies_guard_update
  BEFORE UPDATE ON qbo_archive.forensic_anomalies
  FOR EACH ROW EXECUTE FUNCTION qbo_archive.guard_forensic_anomaly_updates();

GRANT SELECT, INSERT, UPDATE ON qbo_archive.import_batches TO ih35_app;
GRANT SELECT, INSERT ON qbo_archive.entities_snapshot TO ih35_app;
GRANT SELECT, INSERT ON qbo_archive.transactions_snapshot TO ih35_app;
GRANT SELECT, INSERT ON qbo_archive.attachments_snapshot TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo_archive.forensic_anomalies TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo_archive.import_batch_audit_log TO ih35_app;

-- ---------------------------------------------------------------------------
-- C) integrations schema and QBO sync tables
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS integrations;

CREATE TABLE IF NOT EXISTS integrations.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  last_refreshed_at timestamptz,
  last_used_at timestamptz,
  authorized_by_user_id uuid REFERENCES identity.users(id),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qbo_connections_active_company_realm
  ON integrations.qbo_connections (operating_company_id, realm_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_connections_company_active
  ON integrations.qbo_connections (operating_company_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_connections_refresh_expiry_active
  ON integrations.qbo_connections (refresh_token_expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE integrations.qbo_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_connections_company_scope ON integrations.qbo_connections;
CREATE POLICY qbo_connections_company_scope
  ON integrations.qbo_connections
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON integrations.qbo_connections TO ih35_app;

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

-- ---------------------------------------------------------------------------
-- D) dispatch.load_id_reservations table
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS dispatch;

CREATE TABLE IF NOT EXISTS dispatch.load_id_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  reserved_load_number text NOT NULL,
  reserved_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'expired', 'cancelled')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  consumed_load_id uuid REFERENCES mdata.loads(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reserved_load_number)
);

CREATE INDEX IF NOT EXISTS idx_load_id_reservations_status
  ON dispatch.load_id_reservations (operating_company_id, status, expires_at);

GRANT SELECT, INSERT, UPDATE ON dispatch.load_id_reservations TO ih35_app;
ALTER TABLE dispatch.load_id_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS load_id_reservations_select ON dispatch.load_id_reservations;
CREATE POLICY load_id_reservations_select ON dispatch.load_id_reservations
  FOR SELECT TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    AND (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
      OR identity.is_lucia_bypass()
    )
  );

DROP POLICY IF EXISTS load_id_reservations_write ON dispatch.load_id_reservations;
CREATE POLICY load_id_reservations_write ON dispatch.load_id_reservations
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    AND (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
      OR identity.is_lucia_bypass()
    )
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    AND (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
      OR identity.is_lucia_bypass()
    )
  );

-- ---------------------------------------------------------------------------
-- E) docs.files dispatch delivery columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('docs.files') IS NULL THEN
    RAISE NOTICE 'Skipping docs.files dispatch_* reconciliation: docs.files table not present';
    RETURN;
  END IF;

  ALTER TABLE docs.files
    ADD COLUMN IF NOT EXISTS dispatch_load_id uuid REFERENCES mdata.loads(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dispatch_document_channel text
      CHECK (dispatch_document_channel IS NULL OR dispatch_document_channel IN ('portal', 'sms', 'whatsapp', 'email')),
    ADD COLUMN IF NOT EXISTS dispatch_delivery_status text NOT NULL DEFAULT 'pending'
      CHECK (dispatch_delivery_status IN ('pending', 'sent', 'delivered', 'failed')),
    ADD COLUMN IF NOT EXISTS dispatch_external_message_id text,
    ADD COLUMN IF NOT EXISTS dispatch_generated_at timestamptz;
END $$;

CREATE INDEX IF NOT EXISTS idx_docs_files_dispatch_load
  ON docs.files (dispatch_load_id, created_at DESC)
  WHERE dispatch_load_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_docs_files_dispatch_channel_status
  ON docs.files (dispatch_document_channel, dispatch_delivery_status)
  WHERE dispatch_document_channel IS NOT NULL;

-- ---------------------------------------------------------------------------
-- F) catalogs.company_violation_types + default seed rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogs.company_violation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  type_code text NOT NULL,
  type_name text NOT NULL,
  default_severity smallint,
  is_active boolean NOT NULL DEFAULT true,
  default_fine_amount_cents integer,
  amount_cents integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, type_code)
);

ALTER TABLE catalogs.company_violation_types
  ADD COLUMN IF NOT EXISTS default_fine_amount_cents integer,
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

WITH target_companies AS (
  SELECT id AS operating_company_id
  FROM org.companies
),
seed_rows AS (
  SELECT operating_company_id, 'DRIVER_NO_SHOW'::text AS type_code, 'Driver no-show'::text AS type_name, 5::smallint AS default_severity, 25000::integer AS default_fine_amount_cents
  FROM target_companies
  UNION ALL
  SELECT operating_company_id, 'LATE_ARRIVAL', 'Late arrival', 4::smallint, 7500::integer
  FROM target_companies
  UNION ALL
  SELECT operating_company_id, 'DRIVE_WITHOUT_PERMISSION', 'Drive without permission', 7::smallint, 20000::integer
  FROM target_companies
  UNION ALL
  SELECT operating_company_id, 'EQUIPMENT_DAMAGE', 'Damage to equipment', 6::smallint, 12500::integer
  FROM target_companies
  UNION ALL
  SELECT operating_company_id, 'POLICY_VIOLATION', 'Policy violation', 5::smallint, 10000::integer
  FROM target_companies
)
INSERT INTO catalogs.company_violation_types (
  operating_company_id,
  type_code,
  type_name,
  default_severity,
  is_active,
  default_fine_amount_cents,
  amount_cents,
  updated_at
)
SELECT
  operating_company_id,
  type_code,
  type_name,
  default_severity,
  true,
  default_fine_amount_cents,
  default_fine_amount_cents,
  now()
FROM seed_rows
ON CONFLICT (operating_company_id, type_code) DO NOTHING;

COMMIT;
