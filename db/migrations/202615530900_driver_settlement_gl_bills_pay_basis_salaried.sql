-- 202615530900_driver_settlement_gl_bills_pay_basis_salaried.sql
-- CC-3 · LEAD RULING 443.45 Ask C. A salaried driver's week has NO per-load driver bill (Lead 443.36 #2), so the A/P
-- chain bills the settlement's salary pay line on one A/P bill per load with no driver bill behind it (5780: $300.00 on
-- load 13530). Every other run row is backed by its per-load driver bill. pay_basis marks the difference, and the CHECK
-- makes a row with no driver bill impossible unless it is a salaried one. Measured on prod 2026-10-11 08:55 UTC:
-- 147 rows, 0 with driver_bill_id NULL, so the DEFAULT 'per_load_driver_bill' is exactly right for all of them.
-- Additive, idempotent, writes no rows beyond the column default.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE driver_finance.driver_settlement_gl_bills
  ADD COLUMN IF NOT EXISTS pay_basis text NOT NULL DEFAULT 'per_load_driver_bill';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_settlement_gl_bills_pay_basis_check') THEN
    ALTER TABLE driver_finance.driver_settlement_gl_bills
      ADD CONSTRAINT driver_settlement_gl_bills_pay_basis_check
      CHECK (pay_basis IN ('per_load_driver_bill', 'salaried'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_settlement_gl_bills_driver_bill_or_salaried') THEN
    ALTER TABLE driver_finance.driver_settlement_gl_bills
      ADD CONSTRAINT driver_settlement_gl_bills_driver_bill_or_salaried
      CHECK (driver_bill_id IS NOT NULL OR pay_basis = 'salaried');
  END IF;
END $$;

COMMIT;
