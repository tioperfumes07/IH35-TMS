-- B3: add a user-settable posting_date to driver_finance.driver_advances.
--
-- The posting_date is the real book date the disbursement posts under (e.g. cash given
-- May 25 but entered today posts with posting_date = May 25), distinct from created_at
-- (when the row was entered) and disbursed_at (the disbursement timestamp). It drives the
-- journal entry's entry_date when B3 posts via the 'driver_advance' source type. Nullable
-- and additive — existing rows and existing INSERT paths are unaffected.
--
-- Editable + role-gated (isOwnerOrAdmin) + audited (appendCrudAudit old/new) at the
-- service layer; no CHECK/policy change here. RLS + grants already established on the
-- table in migration 0138 (company-isolation policy, SELECT/INSERT/UPDATE to ih35_app).

BEGIN;

ALTER TABLE driver_finance.driver_advances
  ADD COLUMN IF NOT EXISTS posting_date date NULL;

-- Re-affirm column-level grants idempotently (matches 0138; ih35_app only).
DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL
     AND to_regclass('driver_finance.driver_advances') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_advances TO ih35_app;
  END IF;
END
$$;

-- Drift-capture signal.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'driver_finance'
    AND table_name = 'driver_advances'
    AND column_name = 'posting_date'
) AS driver_advances_posting_date_column;

COMMIT;
