-- [HOLD-FOR-JORGE — FINANCIAL] Repoint escrow_balances.last_settlement_id FK from RETIRE settlement.settlement
-- → canonical driver_finance.driver_settlements (settlement-engine collapse). 0-row table; idempotent.
BEGIN;
ALTER TABLE driver_finance.escrow_balances DROP CONSTRAINT IF EXISTS escrow_balances_last_settlement_id_fkey;
ALTER TABLE driver_finance.escrow_balances
  ADD CONSTRAINT escrow_balances_last_settlement_id_fkey
  FOREIGN KEY (last_settlement_id) REFERENCES driver_finance.driver_settlements(id);
COMMIT;
