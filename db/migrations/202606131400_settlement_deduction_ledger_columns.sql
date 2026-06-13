-- A3-1 (FEAT-SETTLEMENT-DEDUCTION-LEDGER-DDL): settlement-deduction ledger columns.
--
-- Additive, idempotent, portable, ZERO recovery-behavior change. Adds carry-forward state to
-- the KEEP ledger driver_finance.driver_settlement_deductions so A3-2 can recover-to-floor and
-- carry the remainder. This block changes NO recovery behavior — it only adds columns A3-2 uses.
--
-- Portability: no hardcoded UUIDs; backfill runs generically across all tenants (B1-seed lesson).
-- Idempotency: ADD COLUMN IF NOT EXISTS, pg_constraint-guarded constraints, IS NULL-guarded backfill.

BEGIN;

-- 1) remaining_balance_cents — how much of this deduction is still owed.
--    NULLABLE, NO default. Required by "zero behavior change": A3-1 does NOT touch the insert path
--    (createSettlementDeduction does not set this column), so DEFAULT 0 would wrongly mark new
--    advances "already paid" and NOT NULL would break inserts. NULL also makes the backfill below
--    safe to re-run. A3-2 owns NULL handling (treats NULL as = amount_cents and sets it on insert).
ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS remaining_balance_cents bigint;

-- 2) status — deduction lifecycle. text + CHECK per repo convention (escrow_deductions_pending),
--    NOT a pg ENUM type: portable + idempotent (no ALTER TYPE). DEFAULT 'pending' populates existing rows.
ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'driver_finance.driver_settlement_deductions'::regclass
      AND conname = 'chk_dsd_status'
  ) THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT chk_dsd_status
      CHECK (status IN ('pending', 'partial', 'applied', 'deferred'));
  END IF;
END $$;

-- 3) Ledger invariant — remaining balance never negative, never exceeds the original amount.
--    NULL allowed (gap-window rows A3-2 initializes). Safe: existing rows are NULL when this runs,
--    and the backfill below fills only valid values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'driver_finance.driver_settlement_deductions'::regclass
      AND conname = 'chk_dsd_remaining_range'
  ) THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT chk_dsd_remaining_range
      CHECK (
        remaining_balance_cents IS NULL
        OR (remaining_balance_cents >= 0 AND remaining_balance_cents <= amount_cents)
      );
  END IF;
END $$;

-- 4) Backfill existing rows ONCE. The `remaining_balance_cents IS NULL` guard makes this idempotent
--    AND safe against re-run: once A3-2 manages a row (non-NULL balance), re-running skips it, so a
--    partial recovery is never reset to full.
UPDATE driver_finance.driver_settlement_deductions
   SET remaining_balance_cents = amount_cents,
       status = 'pending'
 WHERE applied_to_settlement_id IS NULL
   AND remaining_balance_cents IS NULL;

UPDATE driver_finance.driver_settlement_deductions
   SET remaining_balance_cents = 0,
       status = 'applied'
 WHERE applied_to_settlement_id IS NOT NULL
   AND remaining_balance_cents IS NULL;

COMMIT;
