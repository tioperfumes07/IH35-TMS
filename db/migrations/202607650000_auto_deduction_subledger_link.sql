-- Auto-deduction → sub-ledger linkage (FOUNDATION-FIRST Priority 2 / P2a; owner DECISION 1, 2026-07-21)
--
-- WHY: owner ruled Option A — auto-deductions materialize into the canonical
-- driver_finance.driver_settlement_deductions sub-ledger (cents, net-floor-cap-visible), NOT negative
-- driver_finance.settlement_lines rows (dollars). The sub-ledger today has NO column linking a
-- deduction row back to the driver_finance.auto_deduction_policies policy that generated it, so a
-- materializer could neither carry provenance nor be idempotent.
--
-- This migration is purely additive:
--   1. source_auto_deduction_policy_id uuid NULL, FK → driver_finance.auto_deduction_policies(id)
--      (NULL for every manually-created / escrow / bank-sourced deduction — only auto-materialized
--      tranches carry it).
--   2. A partial UNIQUE index on (source_auto_deduction_policy_id) WHERE applied_to_settlement_id IS
--      NULL — at most ONE open (not-yet-applied) tranche per policy at a time. The materializer
--      inserts with ON CONFLICT DO NOTHING against this arbiter, so a re-run (retry, double close
--      attempt) cannot create a second open tranche and double-charge the driver. Once the net-floor
--      cap applier stamps applied_to_settlement_id, the row leaves the index and the next settlement
--      may materialize the next tranche.
--
-- driver_finance.driver_settlement_deductions is 0 rows on prod (verified 2026-07-21 under
-- app.bypass_rls='lucia'), so no backfill. RLS/grants on the table are untouched (FORCED RLS stays).
--
-- Idempotent: safe to apply twice (ADD COLUMN IF NOT EXISTS / pg_constraint guard / CREATE INDEX
-- IF NOT EXISTS). CREATE-only — nothing dropped, no data mutated.

BEGIN;

ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS source_auto_deduction_policy_id uuid
    REFERENCES driver_finance.auto_deduction_policies(id);
COMMENT ON COLUMN driver_finance.driver_settlement_deductions.source_auto_deduction_policy_id IS
  'Provenance link to the driver_finance.auto_deduction_policies row that materialized this deduction tranche (P2a, owner DECISION 1 2026-07-21: auto-deductions live in this sub-ledger, cents, cap-visible — never negative settlement_lines). NULL for manual/escrow/bank-sourced deductions. The partial unique index driver_settlement_deductions_open_auto_tranche_uq enforces at most one open (applied_to_settlement_id IS NULL) tranche per policy, making the materializer idempotent.';

-- Belt-and-braces (ledgered-but-ineffective protection): if the column pre-exists WITHOUT any FK
-- (ADD COLUMN IF NOT EXISTS above would skip and drop the inline REFERENCES), attach the FK here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'driver_finance.driver_settlement_deductions'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'driver_finance.driver_settlement_deductions'::regclass
          AND attname = 'source_auto_deduction_policy_id'
      )]::smallint[]
  ) THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT driver_settlement_deductions_auto_policy_fk
      FOREIGN KEY (source_auto_deduction_policy_id)
      REFERENCES driver_finance.auto_deduction_policies(id);
  END IF;
END $$;

-- One open tranche per policy. NULL source_auto_deduction_policy_id rows (manual deductions) never
-- conflict in a unique index, so the materializer's ON CONFLICT arbiter only bites on a genuine
-- duplicate open auto-tranche.
CREATE UNIQUE INDEX IF NOT EXISTS driver_settlement_deductions_open_auto_tranche_uq
  ON driver_finance.driver_settlement_deductions (source_auto_deduction_policy_id)
  WHERE applied_to_settlement_id IS NULL;

COMMIT;
