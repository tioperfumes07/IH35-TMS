-- WIZARD-CASH-ADVANCE-CREATE-DEPTH (2026-07-22)
-- Additive ops + economic routing columns on driver_finance.driver_advances.
--
-- Prod verified (br-fancy-credit-akjnd07a): load_id EXISTS; unit_id / trailer_id /
-- from_bank_account_id / recovery_mode / economic_routing DO NOT. Prefer additive
-- columns over inventing a parallel table. Financial expense POSTING for lumper
-- remains HOLD (flags OFF / no new GL math) — these columns capture linkage so
-- the create wizard is not forced into fake personal amortize.
--
-- trailer_id → mdata.equipment (trailers live on equipment; mdata.loads has no trailer_id on prod).
-- unit_id → mdata.units. from_bank_account_id → banking.bank_accounts.

BEGIN;

ALTER TABLE driver_finance.driver_advances
  ADD COLUMN IF NOT EXISTS unit_id uuid NULL REFERENCES mdata.units(id),
  ADD COLUMN IF NOT EXISTS trailer_id uuid NULL REFERENCES mdata.equipment(id),
  ADD COLUMN IF NOT EXISTS from_bank_account_id uuid NULL REFERENCES banking.bank_accounts(id),
  ADD COLUMN IF NOT EXISTS recovery_mode text NULL,
  ADD COLUMN IF NOT EXISTS economic_routing text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'driver_advances_recovery_mode_chk'
  ) THEN
    ALTER TABLE driver_finance.driver_advances
      ADD CONSTRAINT driver_advances_recovery_mode_chk
      CHECK (recovery_mode IS NULL OR recovery_mode IN ('full', 'amortize'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'driver_advances_economic_routing_chk'
  ) THEN
    ALTER TABLE driver_finance.driver_advances
      ADD CONSTRAINT driver_advances_economic_routing_chk
      CHECK (
        economic_routing IS NULL
        OR economic_routing IN ('driver_settlement', 'load_expense')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_driver_adv_unit_id
  ON driver_finance.driver_advances (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_adv_trailer_id
  ON driver_finance.driver_advances (trailer_id) WHERE trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_adv_from_bank_account_id
  ON driver_finance.driver_advances (from_bank_account_id) WHERE from_bank_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_adv_economic_routing
  ON driver_finance.driver_advances (economic_routing) WHERE economic_routing IS NOT NULL;

COMMENT ON COLUMN driver_finance.driver_advances.unit_id IS
  'Truck/unit for trip-linked advances (fuel/lumper). Additive wizard-depth 2026-07-22.';
COMMENT ON COLUMN driver_finance.driver_advances.trailer_id IS
  'Trailer (mdata.equipment) for trip-linked advances. Additive wizard-depth 2026-07-22.';
COMMENT ON COLUMN driver_finance.driver_advances.from_bank_account_id IS
  'Company bank account used when disbursement_method = direct_bank_transfer.';
COMMENT ON COLUMN driver_finance.driver_advances.recovery_mode IS
  'full = next settlement single deduct; amortize = periods schedule. NULL for load_expense (not driver-owed).';
COMMENT ON COLUMN driver_finance.driver_advances.economic_routing IS
  'driver_settlement = personal/fuel driver debt; load_expense = ops cost on load (lumper). Expense GL posting HOLD until CPA/Neon.';

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL
     AND to_regclass('driver_finance.driver_advances') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_advances TO ih35_app;
  END IF;
END $$;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance' AND table_name = 'driver_advances' AND column_name = 'unit_id'
  ) AS has_unit_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance' AND table_name = 'driver_advances' AND column_name = 'from_bank_account_id'
  ) AS has_from_bank_account_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance' AND table_name = 'driver_advances' AND column_name = 'economic_routing'
  ) AS has_economic_routing;

COMMIT;
