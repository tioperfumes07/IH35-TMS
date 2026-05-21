-- DS-REMEDIATE-4: persistent reconciliation outage/failure streak state.
-- Supports DD-6 (escalate after 3 consecutive failures + recovery tracking).

BEGIN;

CREATE SCHEMA IF NOT EXISTS _system;
GRANT USAGE ON SCHEMA _system TO ih35_app;

CREATE TABLE IF NOT EXISTS _system.reconciliation_state (
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  integration TEXT NOT NULL CHECK (integration IN ('qbo', 'samsara', 'plaid', 'fmcsa')),
  mirror_category TEXT NOT NULL,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failure_count >= 0),
  last_outage_started_at TIMESTAMPTZ,
  last_outage_recovered_at TIMESTAMPTZ,
  last_successful_tick_at TIMESTAMPTZ,
  last_run_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_run_status IN ('idle', 'ok', 'failed')),
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, integration, mirror_category)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_state_integration_status
  ON _system.reconciliation_state (integration, mirror_category, last_run_status, updated_at DESC);

ALTER TABLE _system.reconciliation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_state_company_scope ON _system.reconciliation_state;
CREATE POLICY reconciliation_state_company_scope
  ON _system.reconciliation_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON _system.reconciliation_state TO ih35_app;

COMMIT;
