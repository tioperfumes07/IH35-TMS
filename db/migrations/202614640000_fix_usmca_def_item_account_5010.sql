-- ROUND 290.12 (Lead order, 2026-09-30) — USMCA DEF line items were misconfigured to post to
-- account 5000 "Fuel & Diesel" instead of the dedicated 5010 "DEF (Diesel Exhaust Fluid)" account,
-- which exists and has carried ZERO postings all-time. Both `createExpenseFromFuelTransaction`
-- (apps/backend/src/fuel/fuel-expense-document.service.ts) and the settlement-corpus seed path
-- (apps/backend/src/feed/seed-settlement-document.service.ts) resolve an expense line's GL account
-- by reading catalogs.items.default_expense_account_id for the matching item_name -- the account
-- is never hardcoded in either code path. The root cause is therefore a DATA misconfiguration on
-- two catalogs.items rows, not a code defect: both USMCA DEF items point at 5000 instead of 5010.
--
-- Confirmed live before writing this: TRANSP's own "Fuel-DEF-Diesel Exhaust Fluid" item correctly
-- points at its own dedicated DEF account (QBO-155 "Fuel-Def") -- USMCA is the only misconfigured
-- entity, and only these two rows.
--
-- Additive/idempotent: only flips default_expense_account_id on the two specific USMCA rows, only
-- if they are still pointed at 5000 (a re-run after a manual fix is a no-op, never an error).

DO $$
DECLARE
  v_usmca_id uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_account_5000 uuid;
  v_account_5010 uuid;
BEGIN
  SELECT id INTO v_account_5000 FROM catalogs.accounts
   WHERE operating_company_id = v_usmca_id AND account_number = '5000';
  SELECT id INTO v_account_5010 FROM catalogs.accounts
   WHERE operating_company_id = v_usmca_id AND account_number = '5010';

  IF v_account_5000 IS NULL OR v_account_5010 IS NULL THEN
    RAISE EXCEPTION 'ROUND 290.12: expected USMCA accounts 5000 and 5010 to both exist -- found 5000=%, 5010=%', v_account_5000, v_account_5010;
  END IF;

  UPDATE catalogs.items
     SET default_expense_account_id = v_account_5010,
         updated_at = now()
   WHERE operating_company_id = v_usmca_id
     AND item_name IN ('Fuel-DEF-Diesel Exhaust Fluid', 'Driver Reimbursement-Fuel Def')
     AND default_expense_account_id = v_account_5000;
END $$;
