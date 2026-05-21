-- DS-REMEDIATE-3: create _system.reconciliation_findings per DS-IMPL-3 Section 5.
-- Populated by reconciliation worker in DS-REMEDIATE-4 (not by this migration).
-- Schema contract locked by DS-IMPL-3 reconciliation worker design (PR #161).

BEGIN;

CREATE SCHEMA IF NOT EXISTS _system;
GRANT USAGE ON SCHEMA _system TO ih35_app;

CREATE TABLE IF NOT EXISTS _system.reconciliation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  integration TEXT NOT NULL
    CHECK (integration IN ('qbo', 'samsara', 'plaid', 'fmcsa')),
  mirror_category TEXT NOT NULL,
  finding_type TEXT NOT NULL
    CHECK (
      finding_type IN (
        'count_drift',
        'value_drift',
        'identity_mismatch',
        'remote_unavailable',
        'webhook_projection_gap',
        'schema_contract_gap',
        'sync_metadata_stale'
      )
    ),
  severity TEXT NOT NULL
    CHECK (severity IN ('critical', 'important', 'cleanup')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciliation_run_id UUID,
  resource_scope JSONB NOT NULL,
  local_value JSONB NOT NULL,
  remote_value JSONB,
  drift_metric_abs NUMERIC(20, 6),
  drift_metric_pct NUMERIC(10, 6),
  threshold_snapshot JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_findings_open_by_company
  ON _system.reconciliation_findings (operating_company_id, status, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_findings_integration_window
  ON _system.reconciliation_findings (integration, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_findings_finding_type
  ON _system.reconciliation_findings (finding_type, status);

CREATE INDEX IF NOT EXISTS idx_recon_findings_resource_scope_gin
  ON _system.reconciliation_findings
  USING GIN (resource_scope);

ALTER TABLE _system.reconciliation_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_findings_company_scope ON _system.reconciliation_findings;
CREATE POLICY reconciliation_findings_company_scope
  ON _system.reconciliation_findings
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON _system.reconciliation_findings TO ih35_app;

COMMIT;
