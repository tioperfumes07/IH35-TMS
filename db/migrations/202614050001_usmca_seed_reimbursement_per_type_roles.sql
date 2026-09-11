-- CLAIM-RESERVE 202614050001 (merged #21719). Depends on 202614050000 (CHECK widen) running
-- first, same dependency shape as 202613810001 depending on 202613810000.
--
-- WHAT THIS MIGRATION DOES: seeds accounting.chart_of_accounts_roles for USMCA, binding the two
-- new roles from 202614050000 to existing accounts:
--   'toll_scale_expense'      -> account 5300 "Tolls & Scales"          (live id 4a0a5b88-3f56-4dc7-853c-37071089315a)
--   'other_operating_expense' -> account 6999 "Other Operating Expense" (live id ba323ec8-78fd-4a4d-a520-36e589448673)
-- live-verified 2026-09-10 (bypass_rls=lucia, tiny-field-89581227). fuel needs no new role/seed
-- here -- it reuses the EXISTING 'company_fuel_advance_expense' role, already bound to account
-- 5000 "Fuel & Diesel" for USMCA (migration 202613750001). lumper is intentionally untouched --
-- it stays on the existing generic 'reimbursement_expense' role (account DRIVERTRIPLU056412
-- "Driver Trip-Lumper Reimbursement"), matching the owner's own "lumper -> Lumper (unchanged)".
--
-- Resolved by account_number ('5300' / '6999'), never a hardcoded account UUID or an
-- account_name ILIKE match -- same convention 202613810001 and 202613750001 both followed.
-- Resolved by org.companies.code = 'USMCA' (never a hardcoded UUID).
--
-- IDEMPOTENT: ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE, matching the
-- uq_coa_roles_company_role_active partial unique index and the 202613810001 seed pattern exactly.
-- FRESH-DB SAFE: RAISE NOTICE + skip (no error) if USMCA or either account don't exist yet in
-- this environment, mirroring 202613810001's own guard shape.

DO $$
DECLARE
  v_usmca uuid;
  v_toll_scale_account uuid;
  v_other_operating_account uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'USMCA company row not found -- skipping reimbursement-per-type role seed';
    RETURN;
  END IF;

  SELECT id INTO v_toll_scale_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND account_number = '5300'
     AND deactivated_at IS NULL
     AND is_postable = true
   LIMIT 1;
  IF v_toll_scale_account IS NULL THEN
    RAISE NOTICE 'USMCA account 5300 Tolls & Scales not found or not postable -- skipping toll_scale_expense seed';
  ELSE
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (v_usmca, 'toll_scale_expense', v_toll_scale_account, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id, updated_at = now();
  END IF;

  SELECT id INTO v_other_operating_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND account_number = '6999'
     AND deactivated_at IS NULL
     AND is_postable = true
   LIMIT 1;
  IF v_other_operating_account IS NULL THEN
    RAISE NOTICE 'USMCA account 6999 Other Operating Expense not found or not postable -- skipping other_operating_expense seed';
  ELSE
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (v_usmca, 'other_operating_expense', v_other_operating_account, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id, updated_at = now();
  END IF;
END $$;
