-- P7 Wave 2 v3 — banking.reconciliation_sessions extended lifecycle columns + statuses.

BEGIN;

ALTER TABLE banking.reconciliation_sessions
  ADD COLUMN IF NOT EXISTS auto_match_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_match_suggestions_count int,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS reopen_reason text;

DO $$
DECLARE
  status_constraint text;
BEGIN
  IF to_regclass('banking.reconciliation_sessions') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
  INTO status_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'banking'
    AND t.relname = 'reconciliation_sessions'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';

  IF status_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE banking.reconciliation_sessions DROP CONSTRAINT %I', status_constraint);
  END IF;

  ALTER TABLE banking.reconciliation_sessions
    ADD CONSTRAINT reconciliation_sessions_status_check
    CHECK (status IN ('open', 'reconciled', 'disputed', 'finalized', 'reopened'));
END
$$;

COMMIT;
