-- ROUND 24.4 item 1 (LOAD-VOID-REGISTER-INCONSISTENCY) — Claude Lead directive.
--
-- FINDING: driver_finance.driver_bills.status='void' and .voided_at can disagree. Live-caught:
-- 3 rows (1 USMCA, load 13508's superseded overpay bill; 2 TRANSP, loads L-20260616-0120 and
-- L-20260627-0036) had status='void' with voided_at NULL -- silently passing every
-- `voided_at IS NULL` filter as though still live. This already fooled a live guard read once
-- (the round's own L1 count read 16 instead of 15 until the row was opened by hand). All 3 rows
-- were register-corrected on prod (voided_at/void_reason/voided_by_user_id stamped to match their
-- own already-void status, using each row's best-evidenced historical void moment from
-- audit.row_changes or its own updated_at where the audit trail predates the row -- never "now",
-- never a new void, never an un-void, no amount or GL touched) before this migration was applied.
--
-- FIX: a CHECK constraint enforcing (status='void') = (voided_at IS NOT NULL), so the two columns
-- can never disagree again for any company. Idempotent (DROP CONSTRAINT IF EXISTS then ADD).
-- Table-wide (not scoped by operating_company_id -- CHECK constraints cannot be scoped that way),
-- which is why the 2 TRANSP rows found while fixing this needed the same register correction
-- before this constraint could build.

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_bills') IS NULL THEN
    RAISE NOTICE 'Skipping driver_bills void/voided_at CHECK: table missing';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE driver_finance.driver_bills DROP CONSTRAINT IF EXISTS chk_driver_bills_void_status_matches_voided_at';

  EXECUTE $chk$
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT chk_driver_bills_void_status_matches_voided_at
      CHECK ((status = 'void') = (voided_at IS NOT NULL))
  $chk$;
END $$;

COMMIT;
