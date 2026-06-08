-- Block F — Insurance policy cancellation + unearned-premium refund.
--
-- ADDITIVE ONLY. The insurance schema, RLS policies, and ih35_app grants already
-- live (0274_insurance.sql, 0284_insurance_payment_schedule.sql, and the Block 5
-- forward-fix link migrations). This migration:
--   1. Adds policy.cancelled_on + policy.cancel_reason (audit of who/when/why).
--      policy.status already permits 'cancelled' (CHECK in 0274) — no enum change.
--   2. Adds payment_schedule.bill_status — an EXPLICIT, auditable lifecycle column
--      that is independent of the existing payment `status` column. It survives
--      reinstatement (cancelling sets 'cancelled'; it can be flipped back later).
--      Backfilled to 'issued' for rows that already carry an accounting bill_uuid.
--   3. Re-asserts the defensive schema + table grants (idempotent).
BEGIN;

-- 1. Policy cancellation audit columns ---------------------------------------
ALTER TABLE insurance.policy
  ADD COLUMN IF NOT EXISTS cancelled_on date NULL;

ALTER TABLE insurance.policy
  ADD COLUMN IF NOT EXISTS cancel_reason text NULL;

COMMENT ON COLUMN insurance.policy.cancelled_on
  IS 'Effective date the policy was cancelled (set by POST /policies/:id/cancel).';
COMMENT ON COLUMN insurance.policy.cancel_reason
  IS 'Free-text reason captured at cancellation time.';

-- 2. Explicit, auditable bill lifecycle on the payment schedule --------------
ALTER TABLE insurance.payment_schedule
  ADD COLUMN IF NOT EXISTS bill_status text NOT NULL DEFAULT 'pending'
    CHECK (bill_status IN ('pending', 'issued', 'cancelled', 'voided'));

COMMENT ON COLUMN insurance.payment_schedule.bill_status
  IS 'Lifecycle of the scheduled bill: pending (not yet issued) -> issued (accounting bill created) | cancelled (stopped before issue) | voided. Independent of the payment `status` column; survives policy reinstatement.';

-- Already-issued rows (a bill was created) are 'issued'; everything else stays 'pending'.
UPDATE insurance.payment_schedule
  SET bill_status = 'issued'
  WHERE bill_uuid IS NOT NULL
    AND bill_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_insurance_payment_schedule_bill_status
  ON insurance.payment_schedule (tenant_id, bill_status);

-- 3. Durable refund obligation (Decision C hardened soft-skip) ----------------
-- When a policy is cancelled but the COA roles needed to post the unearned-
-- premium refund (ap_control / expense_default) are NOT mapped, the cancel
-- still succeeds and a DURABLE obligation row is written here (plus a CRITICAL
-- audit event). It carries everything needed to post the refund later via the
-- existing createJournalEntry() service. The deterministic_memo matches the JE
-- memo so posting is idempotent (a retry never double-posts). When the roles
-- are mapped, the obligation is auto-/one-click postable from the worklist.
CREATE TABLE IF NOT EXISTS insurance.refund_obligation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  policy_id uuid NOT NULL REFERENCES insurance.policy(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  debit_role text NOT NULL DEFAULT 'ap_control',
  credit_role text NOT NULL DEFAULT 'expense_default',
  deterministic_memo text NOT NULL,
  entry_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posted', 'cancelled')),
  journal_entry_id uuid NULL,
  posted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Dedupe: at most one obligation per (tenant, deterministic memo). The memo is
  -- the same string used for JE dedupe, so retries are idempotent end-to-end.
  UNIQUE (tenant_id, deterministic_memo)
);

COMMENT ON TABLE insurance.refund_obligation
  IS 'Durable "refund pending — COA roles unmapped" obligations (Block F Decision C). Drained via createJournalEntry() once ap_control/expense_default are mapped.';

CREATE INDEX IF NOT EXISTS idx_insurance_refund_obligation_pending
  ON insurance.refund_obligation (tenant_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_insurance_refund_obligation_policy
  ON insurance.refund_obligation (policy_id);

ALTER TABLE insurance.refund_obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.refund_obligation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_obligation_tenant_scope ON insurance.refund_obligation;
CREATE POLICY refund_obligation_tenant_scope
  ON insurance.refund_obligation
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_insurance_refund_obligation_updated_at ON insurance.refund_obligation;
CREATE TRIGGER trg_insurance_refund_obligation_updated_at
  BEFORE UPDATE ON insurance.refund_obligation
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

-- 4. Defensive, idempotent grants --------------------------------------------
GRANT USAGE ON SCHEMA insurance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.payment_schedule TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.refund_obligation TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- BEGIN;
--   DROP TABLE IF EXISTS insurance.refund_obligation;
--   DROP INDEX IF EXISTS insurance.idx_insurance_payment_schedule_bill_status;
--   ALTER TABLE insurance.payment_schedule DROP COLUMN IF EXISTS bill_status;
--   ALTER TABLE insurance.policy DROP COLUMN IF EXISTS cancel_reason;
--   ALTER TABLE insurance.policy DROP COLUMN IF EXISTS cancelled_on;
-- COMMIT;
