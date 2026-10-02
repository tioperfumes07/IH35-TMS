-- 202615220800_faro_one_reserve_1230_interest_payable_transaction_fees.sql
-- Owner-approved Faro lifecycle, 2026-10-02 (docs/bus/00-OWNER-ORDER-2026-10-02-ALL-CODERS-BUILD-100-PERCENT-NO-HANDOFF.md
-- §3), source: the executed Faro agreement (~/Desktop/CPA ANSWERS.docx) and Faro's own Account Summary / Reserve Report.
--
-- 1. ONE Faro Security Reserve = 1230 Factoring Reserves. The contract names one reserve (1.5% Security Reserve); Faro's
--    Account Summary carries one "Escrow Reserve" balance; its Purchase Report splits it into two COLUMNS (Escrow Rsv /
--    Cash Rsv) — a presentation split, never a second GL account. 1230 (202607013000 §3g, CPA: "the reserve is OUR asset")
--    is the account with the role and the history. 1236 was a duplicate created by a failed name search
--    (202615000000); 202615220600 bound the role to it in error. Both reserve roles -> 1230; the Faro reserve bank account
--    -> 1230; the second (cash) reserve bank account deactivated; 1235 / 1236 deactivated. Refuses if any of them carries a
--    posting or a bank line (nothing is stranded, nothing is deleted).
-- 2. 2155 Factoring Default Interest Payable (role factor_default_interest_payable): accrued default interest is its own
--    liability, separate from 2150, so 2150 always reconciles to the Net Amount of open Purchased Accounts.
-- 3. 6405 Factoring Transaction Fees (role factor_transaction_fee), a sub-account of 6400 Factoring Fees: the contract's
--    Transaction Fees (Schedule Fee) are distinct from the Factoring Fee (Discount Fee, 6400) — the Repurchase Price
--    recovers unpaid Transaction Fees, never the Factoring Fee.
-- Configuration only: no journal entry, balance or bank line is written. Idempotent. Audited by the tables' row triggers.

BEGIN;

-- New roles appended to the LIVE role CHECK (rebuilt from the current constraint so a concurrent role is never dropped).
DO $$
DECLARE
  def text;
  roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  IF NOT ('factor_default_interest_payable' = ANY(roles) AND 'factor_transaction_fee' = ANY(roles)) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['factor_default_interest_payable', 'factor_transaction_fee']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_usmca constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_1230 uuid; v_1235 uuid; v_1236 uuid; v_6400 uuid; v_2155 uuid; v_6405 uuid;
  v_n bigint;
BEGIN
  SELECT id INTO v_1230 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1230';
  IF v_1230 IS NULL THEN
    RAISE NOTICE '202615220800: USMCA has no 1230 Factoring Reserves; nothing to do';
    RETURN;
  END IF;
  SELECT id INTO v_1235 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1235';
  SELECT id INTO v_1236 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1236';
  SELECT id INTO v_6400 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '6400';

  -- Nothing may be stranded on the accounts being retired.
  SELECT count(*) INTO v_n FROM accounting.journal_entry_postings p WHERE p.account_id IN (v_1235, v_1236);
  IF v_n > 0 THEN RAISE EXCEPTION '202615220800: 1235/1236 carry % posting(s); refusing to retire them', v_n; END IF;
  SELECT count(*) INTO v_n FROM banking.bank_transactions t JOIN banking.bank_accounts b ON b.id = t.bank_account_id
   WHERE b.operating_company_id = v_usmca AND b.ledger_account_id IN (v_1235, v_1236) AND b.account_name = 'Faro Cash Reserve';
  IF v_n > 0 THEN RAISE EXCEPTION '202615220800: the Faro Cash Reserve bank account has % line(s); refusing to deactivate it', v_n; END IF;

  -- 1. Both reserve roles -> 1230.
  UPDATE accounting.chart_of_accounts_roles SET account_id = v_1230, updated_at = now()
   WHERE operating_company_id = v_usmca AND role IN ('factor_reserve_held', 'factor_cash_reserve_held')
     AND account_id IS DISTINCT FROM v_1230;

  -- The Faro reserve bank account (the register for Faro's reserve rows) -> 1230; the second one deactivated.
  UPDATE banking.bank_accounts SET ledger_account_id = v_1230, display_name = 'Faro Reserve', updated_at = now()
   WHERE operating_company_id = v_usmca AND account_name = 'Faro Escrow Reserve' AND ledger_account_id IS DISTINCT FROM v_1230;
  UPDATE banking.bank_accounts SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
   WHERE operating_company_id = v_usmca AND account_name = 'Faro Cash Reserve' AND is_active;

  UPDATE catalogs.accounts SET deactivated_at = COALESCE(deactivated_at, now()), updated_at = now(),
         notes = concat_ws(' ', notes, '[202615220800] merged into 1230 Factoring Reserves — the one Faro Security Reserve.')
   WHERE id IN (v_1235, v_1236) AND deactivated_at IS NULL;

  -- 2. 2155 Factoring Default Interest Payable.
  INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT gen_random_uuid(), v_usmca, '2155', 'Factoring Default Interest Payable', 'Liability', 'OtherCurrentLiability', true
  WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '2155');
  SELECT id INTO v_2155 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '2155';

  -- 3. 6405 Factoring Transaction Fees, under 6400 Factoring Fees.
  INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, parent_account_id, is_postable)
  SELECT gen_random_uuid(), v_usmca, '6405', 'Factoring Transaction Fees', 'Expense', 'Bank Charges', v_6400, true
  WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '6405');
  SELECT id INTO v_6405 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '6405';

  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT v_usmca, r.role, r.account_id, true
    FROM (VALUES ('factor_default_interest_payable', v_2155), ('factor_transaction_fee', v_6405)) AS r(role, account_id)
   WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles x WHERE x.operating_company_id = v_usmca AND x.role = r.role);
END $$;

COMMIT;
