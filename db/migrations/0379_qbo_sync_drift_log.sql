-- QBO-SYNC-4 — drift detection log for ongoing two-way sync monitoring
BEGIN;

CREATE SCHEMA IF NOT EXISTS qbo_sync;

CREATE TABLE IF NOT EXISTS qbo_sync.drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies (id),
  entity_type text NOT NULL CHECK (entity_type IN ('chart_of_accounts', 'items', 'customers', 'vendors')),
  entity_id uuid,
  qbo_id text,
  drift_type text NOT NULL CHECK (drift_type IN ('missing_qbo', 'missing_local', 'field_mismatch')),
  local_snapshot jsonb,
  qbo_snapshot jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_action text CHECK (
    resolution_action IS NULL
    OR resolution_action IN ('accept_local', 'accept_qbo', 'manual_merge_recorded')
  )
);

CREATE INDEX IF NOT EXISTS idx_qbo_sync_drift_log_company_unresolved
  ON qbo_sync.drift_log (operating_company_id, entity_type, detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qbo_sync_drift_log_detected_at
  ON qbo_sync.drift_log (detected_at DESC);

CREATE TABLE IF NOT EXISTS qbo_sync.drift_alert_throttle (
  operating_company_id uuid NOT NULL REFERENCES org.companies (id),
  entity_type text NOT NULL,
  alert_day date NOT NULL,
  drift_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (operating_company_id, entity_type, alert_day)
);

COMMIT;
