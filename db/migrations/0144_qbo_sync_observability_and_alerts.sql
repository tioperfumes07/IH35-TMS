-- P6-T11176 — QBO sync observability: persisted alerts + retry bookkeeping.

BEGIN;

CREATE SCHEMA IF NOT EXISTS qbo;

CREATE TABLE IF NOT EXISTS qbo.sync_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'sync')),
  error_code TEXT,
  error_message TEXT NOT NULL,
  error_payload JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (
    severity IN ('info', 'warning', 'error', 'critical')
  ),
  replay_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_qbo_sync_alerts_unresolved
  ON qbo.sync_alerts(operating_company_id, severity, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_qbo_sync_alerts_retry_due
  ON qbo.sync_alerts(next_retry_at)
  WHERE resolved_at IS NULL AND next_retry_at IS NOT NULL;

ALTER TABLE qbo.sync_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qbo_sync_alerts_company_scope ON qbo.sync_alerts;
CREATE POLICY qbo_sync_alerts_company_scope
  ON qbo.sync_alerts
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON qbo.sync_alerts TO ih35_app;

COMMIT;
