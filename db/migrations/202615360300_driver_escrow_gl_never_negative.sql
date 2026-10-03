-- 202615360300_driver_escrow_gl_never_negative.sql
-- CC-1 · ROUND 374 — a driver escrow is money HELD IN TRUST for the driver. Its balance is the GL (each driver's
-- 2100-00-nnn sub-account, credits minus debits of posted lines — the same definition as
-- driver_finance.v_driver_escrow_balance, migration 202615350300). A debit that takes that GL balance below zero
-- means we released more than we held. The database now refuses it, at COMMIT.
--
-- Why a second refusal: 202615340100's trg_refuse_escrow_over_release sits on driver_finance.escrow_balances — the
-- STORED table. Measured on prod 2026-10-03: on 2100-00-002 / -004 / -027 every escrow contribution had been voided
-- (each credit carries its void reversal), yet on 2026-09-24 19:58Z accounting/escrow/service.ts released 2 / 1 / 6
-- deductions of $25.00 ($50.00 / $25.00 / $150.00) — the stored table never saw the voids and still showed money to
-- release. A refusal on a stored copy guards the copy; this one guards the ledger, and it survives the retirement of
-- the stored escrow tables (kill-the-second-system step 2).
--
-- The rule: CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED, AFTER INSERT on accounting.journal_entry_postings.
-- For a DEBIT to a driver escrow sub-account (an account mapped by accounting.escrow_accounts with holder_type
-- 'driver', never the pooled 2100 parent bound to escrow_liability_default), at COMMIT the account's GL balance over
-- posted entries must be >= 0. A release and the contribution it releases in the same transaction net out before the
-- check. Credits are never refused. The three Sep-24 postings above are closed-period purge population and are not
-- touched (the rule fires on new rows only). Idempotent.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION accounting.refuse_driver_escrow_gl_below_zero()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bal bigint;
  acct text;
BEGIN
  IF NEW.debit_or_credit <> 'debit' THEN
    RETURN NULL;
  END IF;
  -- Only a driver's own escrow sub-account; never the pooled parent.
  IF NOT EXISTS (SELECT 1 FROM accounting.escrow_accounts ea
                  WHERE ea.coa_account_id = NEW.account_id AND ea.holder_type = 'driver')
     OR EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                 WHERE r.account_id = NEW.account_id AND r.role = 'escrow_liability_default') THEN
    RETURN NULL;
  END IF;
  -- The row may have been removed in the same transaction (a governed purge deletes posting and link together).
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.id = NEW.id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint
    INTO bal
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted'
   WHERE p.account_id = NEW.account_id;

  IF bal < 0 THEN
    SELECT a.account_number INTO acct FROM catalogs.accounts a WHERE a.id = NEW.account_id;
    RAISE EXCEPTION 'driver escrow % would hold % cents — a release may not exceed what is held in trust for the driver (ROUND 374). Reverse the release, or release only what the GL holds.', acct, bal
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_driver_escrow_gl_never_negative ON accounting.journal_entry_postings;
CREATE CONSTRAINT TRIGGER trg_driver_escrow_gl_never_negative
  AFTER INSERT ON accounting.journal_entry_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_driver_escrow_gl_below_zero();

COMMENT ON FUNCTION accounting.refuse_driver_escrow_gl_below_zero() IS
  'ROUND 374: at COMMIT, a debit to a driver escrow sub-account (2100-00-nnn) may not leave its GL balance below zero.';

COMMIT;
