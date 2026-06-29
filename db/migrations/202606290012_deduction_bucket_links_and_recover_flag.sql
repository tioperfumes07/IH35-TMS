-- FIN-18 — Wire deductions to their bucket + source expense, and add the per-expense
-- "recover from driver" flag (+ driver picker fields). Additive + idempotent + fresh-DB-safe.
BEGIN;

-- Every deduction line draws from a bucket and (when recovery-sourced) links to its origin expense.
ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS bucket_id uuid NULL REFERENCES driver_finance.driver_deduction_buckets(id);
ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS source_expense_id uuid NULL REFERENCES accounting.expenses(id);

CREATE INDEX IF NOT EXISTS idx_dsd_bucket_id
  ON driver_finance.driver_settlement_deductions (bucket_id) WHERE bucket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dsd_source_expense_id
  ON driver_finance.driver_settlement_deductions (source_expense_id) WHERE source_expense_id IS NOT NULL;

-- Backfill the bucket-event -> deduction FK now that the deductions column set is final.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ddbe_deduction_id_fkey'
  ) THEN
    ALTER TABLE driver_finance.driver_deduction_bucket_events
      ADD CONSTRAINT ddbe_deduction_id_fkey
      FOREIGN KEY (deduction_id) REFERENCES driver_finance.driver_settlement_deductions(id);
  END IF;
END $$;

-- Per-expense "recover from driver" flag + driver picker + bucket selection.
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS recover_from_driver boolean NOT NULL DEFAULT false;
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS recover_deduction_type text NULL;   -- the target bucket_type (e.g. 'damage')

COMMIT;
