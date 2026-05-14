-- P6-T11194 — Background job observability (additive). Ledger used by /healthz + Sentry context.

BEGIN;

CREATE SCHEMA IF NOT EXISTS _system;

CREATE TABLE IF NOT EXISTS _system.background_jobs (
  job_name TEXT PRIMARY KEY,
  last_successful_run_at TIMESTAMPTZ,
  last_failed_run_at TIMESTAMPTZ,
  last_error_message TEXT,
  run_count_today INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_background_jobs_updated ON _system.background_jobs (updated_at DESC);

CREATE OR REPLACE FUNCTION _system.record_job_run(
  p_job_name TEXT,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _system, pg_temp
AS $$
BEGIN
  INSERT INTO _system.background_jobs AS j (
    job_name,
    last_successful_run_at,
    last_failed_run_at,
    last_error_message,
    run_count_today,
    updated_at
  )
  VALUES (
    p_job_name,
    CASE WHEN p_success THEN now() ELSE NULL END,
    CASE WHEN NOT p_success THEN now() ELSE NULL END,
    CASE WHEN NOT p_success THEN LEFT(COALESCE(p_error_message, ''), 2000) ELSE NULL END,
    1,
    now()
  )
  ON CONFLICT (job_name) DO UPDATE SET
    last_successful_run_at =
      CASE WHEN p_success THEN now() ELSE j.last_successful_run_at END,
    last_failed_run_at =
      CASE WHEN NOT p_success THEN now() ELSE j.last_failed_run_at END,
    last_error_message =
      CASE WHEN NOT p_success THEN LEFT(COALESCE(p_error_message, ''), 2000) ELSE j.last_error_message END,
    run_count_today = CASE
      WHEN date_trunc('day', j.updated_at) < date_trunc('day', now()) THEN 1
      ELSE j.run_count_today + 1
    END,
    updated_at = now();
END;
$$;

GRANT SELECT, INSERT, UPDATE ON _system.background_jobs TO ih35_app;
GRANT EXECUTE ON FUNCTION _system.record_job_run(TEXT, BOOLEAN, TEXT) TO ih35_app;

COMMIT;
