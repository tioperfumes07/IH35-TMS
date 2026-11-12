-- ROW-79 / ENG-17 — Wire USMCA fuel-card-payable roles to 2510 / 2520.
--
-- Root cause: accounting.chart_of_accounts_roles had no entries for
-- fuel_card_payable_dreamline or fuel_card_payable_wex on USMCA.
-- resolveRoleAccountOptional returned null for both → readCardPayableBalances
-- skipped both accounts → Dreamline 2510 and WEX 2520 never appeared in the
-- cash-flow forecast regardless of GL balance.
--
-- Fix: bind the two roles to the accounts that already exist in USMCA CoA.
-- This is configuration metadata only; no financial data is created.
-- GL opening balances ($187,894.21 Dreamline / $29,156.88 WEX) must be entered
-- by the owner via TMS JE when known; the forecast will show them once posted.
--
-- WHY NOT ON CONFLICT: chart_of_accounts_roles' unique index is PARTIAL
-- (uq_coa_roles_company_role_active ... WHERE is_active = true); Postgres cannot
-- infer a partial index from a bare ON CONFLICT — same trap as PR #3993.
-- All INSERTs below are NOT EXISTS-guarded.
--
-- WHY THE PER-ENTITY set_config: accounting.chart_of_accounts_roles' RLS WITH CHECK
-- is (operating_company_id = current_setting('app.operating_company_id')) with NO
-- is_lucia_bypass() branch — write fails regardless of app.bypass_rls unless the GUC
-- names this entity. catalogs.accounts' WITH CHECK carries the bypass; these are not symmetric.

BEGIN;

DO $$
DECLARE
  v_opco UUID;
  v_2510 UUID;
  v_2520 UUID;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA';
  IF v_opco IS NULL THEN
    RAISE EXCEPTION 'USMCA company not found — refusing to wire roles blind';
  END IF;
  PERFORM set_config('app.operating_company_id', v_opco::text, true);

  SELECT id INTO v_2510
    FROM catalogs.accounts
   WHERE operating_company_id = v_opco AND account_number = '2510' AND deactivated_at IS NULL;
  IF v_2510 IS NULL THEN
    -- A database built from source (CI, DR restore, fresh branch) has no USMCA chart of accounts rows, so
    -- there is nothing to bind; on production 2510/2520 exist and the roles were bound 2026-11-12 22:24Z.
    RAISE NOTICE 'USMCA account 2510 (Dreamline Diesel Card Payable) not present — role binding skipped (fresh database)';
    RETURN;
  END IF;

  SELECT id INTO v_2520
    FROM catalogs.accounts
   WHERE operating_company_id = v_opco AND account_number = '2520' AND deactivated_at IS NULL;
  IF v_2520 IS NULL THEN
    -- A database built from source (CI, DR restore, fresh branch) has no USMCA chart of accounts rows, so
    -- there is nothing to bind; on production 2510/2520 exist and the roles were bound 2026-11-12 22:24Z.
    RAISE NOTICE 'USMCA account 2520 (WEX Fleet Card) not present — role binding skipped (fresh database)';
    RETURN;
  END IF;

  -- fuel_card_payable_dreamline → 2510
  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT v_opco, 'fuel_card_payable_dreamline', v_2510, true
   WHERE NOT EXISTS (
     SELECT 1 FROM accounting.chart_of_accounts_roles x
      WHERE x.operating_company_id = v_opco
        AND x.role = 'fuel_card_payable_dreamline'
        AND x.is_active = true
   );

  -- fuel_card_payable_wex → 2520
  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT v_opco, 'fuel_card_payable_wex', v_2520, true
   WHERE NOT EXISTS (
     SELECT 1 FROM accounting.chart_of_accounts_roles x
      WHERE x.operating_company_id = v_opco
        AND x.role = 'fuel_card_payable_wex'
        AND x.is_active = true
   );
END $$;

COMMIT;
