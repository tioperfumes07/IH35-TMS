-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] F9-04/05 — bill_unit_allocation recompute supersedes, never DELETE.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Derived projection: still avoid delete-all empty window + preserve allocation history for audit.
-- Cursor band. Idempotent.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.bill_unit_allocation') IS NULL THEN
    RAISE NOTICE 'F9-04: bill_unit_allocation absent — skip';
    RETURN;
  END IF;

  ALTER TABLE accounting.bill_unit_allocation
    ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS superseded_reason text NULL;

  CREATE INDEX IF NOT EXISTS ix_bill_unit_allocation_active_bill
    ON accounting.bill_unit_allocation (tenant_id, bill_id)
    WHERE superseded_at IS NULL;
END
$$;

COMMIT;
