-- ROUND 24.4 item 1 (LOAD-VOID-REGISTER-INCONSISTENCY) — Claude Lead directive + owner ruling.
--
-- FINDING: driver_finance.driver_bills.status='void' and .voided_at can disagree. Live-caught:
-- 1 USMCA row (load 13508's superseded overpay bill) had status='void' with voided_at NULL --
-- silently passing every `voided_at IS NULL` filter as though still live. This already fooled a
-- live guard read once. Register-corrected on prod (voided_at/void_reason/voided_by_user_id
-- stamped to match its own already-void status, using the row's best-evidenced historical void
-- moment from audit.row_changes -- never "now", never a new void, never an un-void, no amount or
-- GL touched) before this migration was applied.
--
-- ALSO FOUND, NOT FIXED: the identical inconsistency exists on 2 TRANSPORTATION driver_bills
-- rows. TRANSPORTATION IS FROZEN (owner ruling) -- no reads, no writes, no reports beyond what is
-- needed to disclose the finding. Those 2 rows are untouched.
--
-- FIX: a CHECK constraint enforcing (status='void') = (voided_at IS NOT NULL), added NOT VALID.
-- NOT VALID enforces the rule on every INSERT and UPDATE from this moment forward while leaving
-- the 2 pre-existing TRANSP rows unscanned and untouched -- the constraint is table-wide (CHECK
-- constraints cannot be scoped by operating_company_id) so this is the only way to close the
-- defect going forward without writing into the frozen entity. convalidated=false is the
-- permanent, queryable record that the pre-existing TRANSP rows were never proven; VALIDATE
-- CONSTRAINT remains available the day TRANSPORTATION is unfrozen and is deliberately NOT run
-- here (it would fail on those 2 rows, and forcing it past would mean writing them). Idempotent
-- (DROP CONSTRAINT IF EXISTS then ADD ... NOT VALID).

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_bills') IS NULL THEN
    RAISE NOTICE 'Skipping driver_bills void/voided_at CHECK: table missing';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE driver_finance.driver_bills DROP CONSTRAINT IF EXISTS chk_driver_bills_void_status_matches_voided_at';
  EXECUTE 'ALTER TABLE driver_finance.driver_bills DROP CONSTRAINT IF EXISTS chk_driver_bills_void_register_consistent';

  EXECUTE $chk$
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT chk_driver_bills_void_register_consistent
      CHECK ((status = 'void') = (voided_at IS NOT NULL)) NOT VALID
  $chk$;
END $$;

COMMIT;
