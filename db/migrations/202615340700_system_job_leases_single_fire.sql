-- 202615340700_system_job_leases_single_fire.sql
-- Standing order point 9 (single-fire): "withJobLease on every scheduled path." The backend runs 2 instances and every
-- node-cron schedule fires on both; wrapBackgroundJobTick only RECORDS outcomes. Measured 2026-10-03: six of CC-2's
-- crons took no lock at all (bank tie-out, bank drift alerts, factoring repurchase-due, Love's card import, the
-- reconciliation worker's four categories, Samsara fuel reports). Their targets are idempotent at the database
-- (unique per advance/day, one open alert per account/kind, one tie-out per day, ON CONFLICT on repurchase lines), so
-- nothing double-posts today — but each tick did the work twice and the loser's conflict could be recorded as a failure.
-- _system.job_leases: one row per job; claiming is one atomic statement (INSERT ... ON CONFLICT DO UPDATE ... WHERE the
-- current lease has expired), so exactly one instance holds a job inside its lease window. System bookkeeping like
-- _system.background_jobs (no company, no RLS).

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

CREATE TABLE IF NOT EXISTS _system.job_leases (
  job_name          text PRIMARY KEY,
  holder            text NOT NULL,
  leased_at         timestamptz NOT NULL DEFAULT now(),
  leased_until      timestamptz NOT NULL,
  last_finished_at  timestamptz,
  CHECK (leased_until > leased_at)
);
COMMENT ON TABLE _system.job_leases IS
  'Single-fire leases for scheduled jobs (standing order point 9). withJobLease() in apps/backend/src/lib/background-jobs.ts claims atomically; a second instance inside the window skips.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT USAGE ON SCHEMA _system TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON _system.job_leases TO ih35_app;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('_system.job_leases') IS NULL THEN
    RAISE EXCEPTION '202615340700: _system.job_leases missing';
  END IF;
END $$;

COMMIT;
