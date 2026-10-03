-- OWNER ORDER 2026-10-03 — KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE. Table 1 (CC-1).
--
-- accounting.escrow_accounts.balance_cents was a stored running total, kept by trg_apply_escrow_posting_delta on every
-- accounting.escrow_postings insert. The number belongs to the GL: the driver's 2100-00-nnn sub-account
-- (driver_finance.v_driver_escrow_balance / accounting.v_escrow_account_balance — credits minus debits of posted lines).
-- Measured 2026-10-03 (prod, USMCA): 44 driver rows, the stored figure disagreed with the GL on 10. Every reader was
-- repointed to the views first (step 1, accepted); the only writer left is the trigger function below.
--
-- What stays: the mapping row (holder_id, holder_type, purpose, coa_account_id, status) and every escrow_postings row.
-- What the trigger keeps: its posting_type validation (deposit | release | forfeiture, anything else refused).
-- Repair nothing: the column is removed, not reconciled.
--
-- Idempotent: CREATE OR REPLACE FUNCTION; DROP COLUMN IF EXISTS.

CREATE OR REPLACE FUNCTION accounting.apply_escrow_posting_delta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- KILL THE SECOND SYSTEM (2026-10-03): this trigger no longer keeps a stored balance — the escrow balance is the
  -- 2100-00-nnn GL. It still refuses a posting type it does not know (never a silent sign).
  IF NEW.posting_type IS NULL OR NEW.posting_type NOT IN ('deposit', 'release', 'forfeiture') THEN
    RAISE EXCEPTION
      'accounting.apply_escrow_posting_delta: unknown posting_type=% (expected deposit|release|forfeiture)',
      NEW.posting_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION accounting.apply_escrow_posting_delta() IS
  'KILL THE SECOND SYSTEM table 1 (2026-10-03): validates escrow_postings.posting_type only. The escrow balance is derived from the 2100-00-nnn GL (driver_finance.v_driver_escrow_balance); accounting.escrow_accounts.balance_cents no longer exists.';

-- The refusal that kept the STORED balance from going negative (F-1, 202615340100) depends on the column. Its fact is
-- owned by the GL now: trg_refuse_driver_escrow_gl_debit_balance and trg_driver_escrow_gl_never_negative refuse a driver
-- 2100-00-nnn sub-account below zero on journal_entry_postings.
DROP TRIGGER IF EXISTS trg_refuse_driver_escrow_account_negative ON accounting.escrow_accounts;
DROP FUNCTION IF EXISTS accounting.refuse_driver_escrow_account_negative();

ALTER TABLE accounting.escrow_accounts DROP COLUMN IF EXISTS balance_cents;
