-- Block D — Insurance policy renewal (clone-forward).
--
-- ADDITIVE ONLY. Adds insurance.policy.renewed_from_policy_id so a renewed policy
-- records the policy it was cloned from (self-reference). POST
-- /api/v1/insurance/policies/:id/renew clones the source policy + its policy_unit
-- children, resets the term fields, and regenerates the premium bill schedule via
-- the canonical createPolicyBillSchedule() (same atomic pattern as Block 5 / GAP-86).
--
-- Schema + base grants for `insurance` already live (0274_insurance.sql); the GRANTs
-- below are defensive and idempotent (GRANT is naturally re-runnable).
BEGIN;

ALTER TABLE insurance.policy
  ADD COLUMN IF NOT EXISTS renewed_from_policy_id uuid NULL
    REFERENCES insurance.policy(id) ON DELETE SET NULL;

COMMENT ON COLUMN insurance.policy.renewed_from_policy_id
  IS 'Source policy this row was cloned from via POST /insurance/policies/:id/renew (NULL for originals).';

CREATE INDEX IF NOT EXISTS idx_insurance_policy_renewed_from_policy_id
  ON insurance.policy (renewed_from_policy_id)
  WHERE renewed_from_policy_id IS NOT NULL;

-- Defensive grants (idempotent): ensure the app role can use the schema + tables.
GRANT USAGE ON SCHEMA insurance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy_unit TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.payment_schedule TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP INDEX IF EXISTS insurance.idx_insurance_policy_renewed_from_policy_id;
-- ALTER TABLE insurance.policy DROP COLUMN IF EXISTS renewed_from_policy_id;
