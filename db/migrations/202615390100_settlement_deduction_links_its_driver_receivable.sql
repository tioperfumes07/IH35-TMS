-- ROUND 394 RULING 2, step 2 (CC-1) — a settlement deduction names the driver receivable it recovers.
--
-- Accident damage and civil / internal fines are DRIVER RECEIVABLES: creating one posts Dr 1255 / 1256
-- (driver_damage_receivable / driver_fine_receivable) / Cr the matching recovery account. The settlement
-- deduction spawned with it must then credit THAT receivable at pay-run close, not the recovery account a
-- second time. driver_settlement_deductions had no column naming the liability it repays (the link lived
-- only in safety.civil_fines.driver_settlement_deduction_id and audit payloads), and other paths create
-- damage / fine deductions with no receivable behind them (manual, bank-line recoveries, complaints,
-- contract terms) — so the deduction type alone cannot decide. liability_id does.
--
-- Additive, nullable; existing rows keep NULL (USMCA, measured 2026-10-04: 0 damage / fine / negative-
-- settlement liabilities exist, so nothing to backfill). RLS on the table is unchanged (row already
-- entity-scoped by operating_company_id). Idempotent.

ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS liability_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_settlement_deductions_liability_id_fkey') THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT driver_settlement_deductions_liability_id_fkey
      FOREIGN KEY (liability_id) REFERENCES driver_finance.driver_liabilities(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_driver_settlement_deductions_liability_id
  ON driver_finance.driver_settlement_deductions (liability_id)
  WHERE liability_id IS NOT NULL;

COMMENT ON COLUMN driver_finance.driver_settlement_deductions.liability_id IS
  'ROUND 394 ruling 2: the driver receivable (driver_finance.driver_liabilities) this deduction recovers. When set and the liability type is a posted receivable, pay-run close credits that receivable (1255 / 1256), not a recovery income/expense account.';
