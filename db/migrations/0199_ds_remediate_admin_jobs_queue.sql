-- DS-REMEDIATE-1: durable admin jobs queue for moving external calls out of request paths.
-- Forward-only, additive migration.

BEGIN;

CREATE SCHEMA IF NOT EXISTS _system;

CREATE TABLE IF NOT EXISTS _system.admin_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  requested_by_user_id UUID REFERENCES identity.users(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  last_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1 AND max_attempts <= 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_admin_jobs_claim
  ON _system.admin_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS ix_admin_jobs_company_recent
  ON _system.admin_jobs (operating_company_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_jobs_active_idempotency
  ON _system.admin_jobs (operation, idempotency_key)
  WHERE status IN ('queued', 'running');

ALTER TABLE _system.admin_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_jobs_company_scope ON _system.admin_jobs;
CREATE POLICY admin_jobs_company_scope
  ON _system.admin_jobs
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON _system.admin_jobs TO ih35_app;

COMMIT;
