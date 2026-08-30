-- GO-CLOSE-188 CC-1 DEFECT B — USMCA's TEST DATA Amex bank_accounts row shares its cash GL account
-- with the real "USMCA FREIGHT" bank account.
--
-- WHAT WAS WRONG
-- banking.bank_accounts "TEST DATA Amex TESTMTDP79YF" (account_class='credit', id 9564ca46-...) had
-- ledger_account_id -> catalogs.accounts c7af1219-... "Bank of America - Operating (USMCA)" (Asset,
-- account #1000) -- the EXACT SAME row that banking.bank_accounts "USMCA FREIGHT" (the real Bank of
-- America depository, id e83028a5-...) is correctly bridged to. No dedicated USMCA credit-card
-- liability account was ever created, so whatever seeded the Amex test row fell back to the operating
-- cash account instead. Bank categorization resolves the GL leg from this column (see the sibling fix
-- 202612100000_repoint_amex_bank_account_to_card_liability.sql for the identical defect shape on
-- TRANSP's real Amex), so the next categorized Amex transaction would post a card purchase as a credit
-- against the operating CASH asset instead of a card LIABILITY -- silently drawing down cash that never
-- moved and permanently breaking that account's GL-delta / subledger tie-out (C25/C26).
--
-- BLAST RADIUS CHECKED BEFORE WRITING THIS MIGRATION (live Neon read, 2026-08-30)
-- catalogs.accounts c7af1219 currently carries 206 credit postings ($177,411.20) vs 53 debit postings
-- ($13,503.70) -- the exact imbalance GO-CLOSE-188 cites as the C25/C26 blocker. Of those, the 34
-- bank_categorization-sourced postings all trace via banking.bank_transactions.bank_account_id back to
-- the REAL "USMCA FREIGHT" account (e83028a5), NOT the Amex row -- the Amex side of this bug has not
-- yet posted anything (no Amex bank_transactions have been categorized). This migration is therefore a
-- pure prevention fix: no historical postings need a correcting journal entry, so none is written here.
-- The remaining imbalance on c7af1219 is DEFECT A territory (customer payments parking in Undeposited
-- Funds instead of debiting this account) and is out of scope for this migration.
--
-- SCOPE
-- Entity-scoped to USMCA only. Idempotently creates a dedicated "Amex Credit Card Payable" liability
-- account if one doesn't already exist, then repoints exactly the one bank_accounts row that is
-- currently miswired (keyed on the defect itself -- credit-class account pointed at a non-Liability --
-- so this is a no-op if someone has already corrected it by hand). Finally adds a partial unique index
-- so no active bank account, in any entity, can ever again share a ledger_account_id with another
-- active bank account -- this is what makes DEFECT B structurally unable to recur.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_amex_ledger uuid;
  v_rows int;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'acct-defect-b: USMCA absent (fresh CI DB) -- skipping (0 rows).';
    RETURN;
  END IF;

  -- Scope BEFORE the FORCED-RLS reads/writes (CONN-3 Part C lesson: set app.operating_company_id first
  -- or a stale/blank GUC silently no-ops these lookups while still reporting success).
  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  -- 1) Idempotently create the missing USMCA Amex Credit Card Payable liability account. #2500 is free
  -- in USMCA's chart (checked live: liabilities in use are 2000/2100/2150/2160/2170/2200/2400/2410/2600).
  SELECT id INTO v_amex_ledger
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND account_number = '2500'
     AND account_type = 'Liability'
   LIMIT 1;

  IF v_amex_ledger IS NULL THEN
    INSERT INTO catalogs.accounts
      (account_number, account_name, account_type, account_subtype, operating_company_id, is_postable)
    VALUES
      ('2500', 'Amex Credit Card Payable', 'Liability', 'CreditCard', v_usmca, true)
    ON CONFLICT (operating_company_id, account_number) DO NOTHING
    RETURNING id INTO v_amex_ledger;

    IF v_amex_ledger IS NULL THEN
      SELECT id INTO v_amex_ledger FROM catalogs.accounts
      WHERE operating_company_id = v_usmca AND account_number = '2500' LIMIT 1;
    END IF;
  END IF;

  IF v_amex_ledger IS NULL THEN
    RAISE NOTICE 'acct-defect-b: could not create/find the Amex Credit Card Payable account -- skipping repoint.';
    RETURN;
  END IF;

  -- 2) Only repoint a credit-class bank account that is currently bridged to a NON-liability. Keyed on
  -- the defect itself rather than the account name, so a hand-fix makes this a no-op instead of a
  -- surprise second write.
  UPDATE banking.bank_accounts ba
     SET ledger_account_id = v_amex_ledger,
         updated_at = now()
    FROM catalogs.accounts led
   WHERE ba.id = (
           SELECT b.id
             FROM banking.bank_accounts b
             JOIN catalogs.accounts l ON l.id = b.ledger_account_id
            WHERE b.operating_company_id = v_usmca
              AND b.account_class = 'credit'
              AND b.account_name ILIKE 'TEST DATA Amex%'
              AND l.account_type <> 'Liability'
            LIMIT 1
         )
     AND led.id = ba.ledger_account_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'acct-defect-b: % bank account(s) repointed to the USMCA Amex Credit Card Payable account.', v_rows;
END$$;

-- 3) Prevent recurrence, for every entity, going forward: no two ACTIVE bank accounts may share one
-- ledger_account_id. A partial unique index (not a trigger) so it also catches any future bulk backfill
-- or seed script, not just the app's own write path.
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_active_ledger_account_uidx
  ON banking.bank_accounts (operating_company_id, ledger_account_id)
  WHERE is_active = true AND deactivated_at IS NULL AND ledger_account_id IS NOT NULL;

COMMIT;
