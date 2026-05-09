BEGIN;

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

ALTER TABLE qbo_archive.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.entities_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.transactions_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.attachments_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_archive.forensic_anomalies ENABLE ROW LEVEL SECURITY;

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

-- Immutable evidence snapshots: forbid UPDATE/DELETE.
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

-- Forensic anomaly review is mutable only for review_* fields.
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

COMMIT;

