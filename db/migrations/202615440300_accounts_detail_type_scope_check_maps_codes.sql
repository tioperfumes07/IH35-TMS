-- 202615440300_accounts_detail_type_scope_check_maps_codes.sql
-- CC-1 · LST-F430 — an account can carry a detail type of its own account type again.
--
-- catalogs.accounts.account_type holds one of the app's 8 values (Asset, Liability, Equity, Income, Expense,
-- CostOfGoodsSold, OtherIncome, OtherExpense). catalogs.account_types holds 15 QBO-style codes (BANK, AR, OCA, FA, OA,
-- CC, AP, OCL, LTL, EQ, INC, OINC, COGS, EXP, OEXP) with display names ("Credit Card", "Other Current Liabilities",
-- "Expenses", ...). The trigger from 202608080000 compared account_type to the code or the display name, so only
-- Equity and Income ever matched, by coincidence. Every Asset, Liability, Expense, Cost of Goods Sold, Other Income and
-- Other Expense detail type was refused with "account_type mismatch". Measured 2026-10-07 on a prod fork: creating
-- "Credit Cards" (Liability) with detail type CC/Credit Card through POST /api/v1/catalogs/accounts returned 400
-- invalid_account_check_constraint. Zero USMCA accounts carry a detail_type_id.
--
-- The route already fixed the same mismatch (COA-DETAIL-TYPE-VOCAB-MISMATCH-BACKEND, CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM
-- in apps/backend/src/catalogs/accounts.routes.ts); the database rule never was. This maps the code to the
-- account_type the same way. A code or display-name match is still accepted, so nothing that passed before fails now.
-- A detail type of a DIFFERENT account type (an Asset with CC/Credit Card) is still refused.
-- scripts/verify-account-detail-type-trigger-matches-route.mjs keeps this map equal to the route's.
-- Function body only: the trigger itself is unchanged. No data is touched.

CREATE OR REPLACE FUNCTION catalogs.accounts_detail_type_scope_check()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_dt_opco uuid;
  v_dt_type_code text;
  v_dt_type_name text;
  v_expected_account_type text;
BEGIN
  IF NEW.detail_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT dt.operating_company_id, at.code, at.name
    INTO v_dt_opco, v_dt_type_code, v_dt_type_name
  FROM catalogs.detail_types dt
  JOIN catalogs.account_types at ON at.id = dt.account_type_id
  WHERE dt.id = NEW.detail_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accounts.detail_type_id % not found', NEW.detail_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_dt_opco IS NOT NULL AND v_dt_opco IS DISTINCT FROM NEW.operating_company_id THEN
    RAISE EXCEPTION 'accounts.detail_type_id cross-entity (detail_type opco %, account opco %)',
      v_dt_opco, NEW.operating_company_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- LST-F430: catalog code -> the app's account_type (same map as accounts.routes.ts CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM).
  v_expected_account_type := CASE v_dt_type_code
    WHEN 'BANK' THEN 'Asset'
    WHEN 'AR'   THEN 'Asset'
    WHEN 'OCA'  THEN 'Asset'
    WHEN 'FA'   THEN 'Asset'
    WHEN 'OA'   THEN 'Asset'
    WHEN 'CC'   THEN 'Liability'
    WHEN 'AP'   THEN 'Liability'
    WHEN 'OCL'  THEN 'Liability'
    WHEN 'LTL'  THEN 'Liability'
    WHEN 'EQ'   THEN 'Equity'
    WHEN 'INC'  THEN 'Income'
    WHEN 'OINC' THEN 'OtherIncome'
    WHEN 'COGS' THEN 'CostOfGoodsSold'
    WHEN 'EXP'  THEN 'Expense'
    WHEN 'OEXP' THEN 'OtherExpense'
    ELSE NULL
  END;

  IF NEW.account_type IS NOT NULL
     AND NEW.account_type IS DISTINCT FROM v_expected_account_type
     AND NEW.account_type IS DISTINCT FROM v_dt_type_code
     AND NEW.account_type IS DISTINCT FROM v_dt_type_name THEN
    RAISE EXCEPTION 'accounts.detail_type_id account_type mismatch (account %, detail_type %/%)',
      NEW.account_type, v_dt_type_code, v_dt_type_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
