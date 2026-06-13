-- B5: link a driver advance to the driver_bill it was applied against (cascade branches 1/2).
--
-- When an approved cash advance is applied as a "bill payment" against the driver's load pay
-- (driver_finance.driver_bills), record which bill it landed on so the settlement can net it
-- and reports can trace it. NULL for the loan branch (branch 3, no bill link). Additive,
-- nullable; existing rows and INSERT paths are unaffected. RLS + grants already on the table
-- from migration 0138.

BEGIN;

ALTER TABLE driver_finance.driver_advances
  ADD COLUMN IF NOT EXISTS linked_driver_bill_id uuid NULL
    REFERENCES driver_finance.driver_bills(id);

CREATE INDEX IF NOT EXISTS idx_driver_adv_linked_driver_bill
  ON driver_finance.driver_advances (linked_driver_bill_id)
  WHERE linked_driver_bill_id IS NOT NULL;

-- Re-affirm column-level grants idempotently (matches 0138; ih35_app only).
DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL
     AND to_regclass('driver_finance.driver_advances') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_advances TO ih35_app;
  END IF;
END
$$;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'driver_finance'
    AND table_name = 'driver_advances'
    AND column_name = 'linked_driver_bill_id'
) AS driver_advances_linked_driver_bill_column;

COMMIT;
