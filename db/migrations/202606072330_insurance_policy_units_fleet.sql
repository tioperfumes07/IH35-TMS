-- Block E — Insurance Fleet Add/Remove (mid-term endorsement support).
--
-- Adds soft-delete support to insurance.policy_unit so a truck/trailer can be
-- removed from an ACTIVE policy mid-term without losing the coverage-history row
-- (active = removed_at IS NULL, inactive = removed_at IS NOT NULL). Re-adding the
-- same asset_id reactivates the existing row (idempotent upsert on the existing
-- UNIQUE (tenant_id, policy_id, asset_id) constraint).
--
-- ADDITIVE ONLY. No financial ledger code: pro-rata premium deltas/credits are
-- logged in the route layer via accounting.createJournalEntry(). This migration
-- only touches the insurance.policy_unit row shape + grants.
--
-- Grants are defensive/idempotent: 0274_insurance.sql already granted USAGE +
-- table privileges to ih35_app, but Block J showed grant drift is a real risk,
-- so we re-assert schema USAGE, table privileges, and sequence privileges here.
-- All privileges are scoped to the ih35_app application role (NOT app_user).
--
-- Idempotent: every statement is safe to re-run.

BEGIN;

ALTER TABLE insurance.policy_unit
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ NULL;

-- Fast lookup of currently-active units on a policy (the common fleet query).
CREATE INDEX IF NOT EXISTS idx_insurance_policy_unit_active
  ON insurance.policy_unit (tenant_id, policy_id)
  WHERE removed_at IS NULL;

-- Defensive idempotent grants (ih35_app application role, NOT app_user).
GRANT USAGE ON SCHEMA insurance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy_unit TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA insurance TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA insurance TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA insurance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA insurance
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP INDEX IF EXISTS insurance.idx_insurance_policy_unit_active;
-- ALTER TABLE insurance.policy_unit DROP COLUMN IF EXISTS removed_at;
