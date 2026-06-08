-- BLOCK-08: tier-2 load-test baseline historical run ledger.
BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;
GRANT USAGE ON SCHEMA ops TO ih35_app;

CREATE TABLE IF NOT EXISTS ops.load_test_runs (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  scenario_name TEXT NOT NULL CHECK (
    scenario_name IN (
      'dispatch-board-realtime',
      'driver-pwa-sync',
      'invoice-creation-burst',
      'qbo-sync-backlog'
    )
  ),
  run_mode TEXT NOT NULL DEFAULT 'nightly' CHECK (run_mode IN ('nightly', 'smoke', 'adhoc')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'pass', 'fail')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  requests_total INTEGER NOT NULL DEFAULT 0 CHECK (requests_total >= 0),
  requests_failed INTEGER NOT NULL DEFAULT 0 CHECK (requests_failed >= 0),
  get_p95_ms NUMERIC(10, 2) NULL CHECK (get_p95_ms IS NULL OR get_p95_ms >= 0),
  post_p95_ms NUMERIC(10, 2) NULL CHECK (post_p95_ms IS NULL OR post_p95_ms >= 0),
  qbo_sync_p95_ms NUMERIC(10, 2) NULL CHECK (qbo_sync_p95_ms IS NULL OR qbo_sync_p95_ms >= 0),
  thresholds_passed BOOLEAN NOT NULL DEFAULT false,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_started_by TEXT NULL,
  run_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT load_test_runs_finished_after_start CHECK (
    finished_at IS NULL OR finished_at >= started_at
  )
);

CREATE INDEX IF NOT EXISTS idx_load_test_runs_company_started_at
  ON ops.load_test_runs (operating_company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_load_test_runs_scenario_started_at
  ON ops.load_test_runs (scenario_name, started_at DESC);

ALTER TABLE ops.load_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.load_test_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS load_test_runs_tenant_scope ON ops.load_test_runs;
CREATE POLICY load_test_runs_tenant_scope
  ON ops.load_test_runs
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON ops.load_test_runs TO ih35_app;

COMMIT;
