-- CLAIM-RESERVE 202613750001 (merged #20409). Depends on 202613740001 (CHECK widen) running first.
--
-- WHAT THIS MIGRATION DOES: seeds accounting.chart_of_accounts_roles for USMCA, binding the new
-- 'company_fuel_advance_expense' role to the existing account 5000 "Fuel & Diesel" (CostOfGoodsSold,
-- postable, active) — live-verified 2026-09-04 (bypass_rls=lucia): id 353fbd5b-d39c-4709-ac19-60cae52018f7.
-- LOAD-COSTS-COMPLETE-VERTICAL spec 09-04-2026 §1.2: no new account created, no rename — reuses the
-- account that already exists and is already postable, matching owner ruling "do not create a new
-- account" (the same instruction given for the parallel fixed_asset_default seed, 202613580001).
--
-- Resolved by org.companies.code = 'USMCA' (never a hardcoded UUID) and
-- catalogs.accounts.account_number/operating_company_id (never a hardcoded account UUID either) —
-- both looked up live inside this migration.
--
-- IDEMPOTENT: ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE, matching the
-- uq_coa_roles_company_role_active partial unique index and the 202612880000 seed pattern exactly.
-- FRESH-DB SAFE: RAISE NOTICE + skip (no error) if USMCA or the account don't exist yet in this
-- environment, mirroring 202612880000's own guard shape.

DO $$
DECLARE
  v_usmca uuid;
  v_fuel_account uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'USMCA company row not found -- skipping company_fuel_advance_expense seed';
    RETURN;
  END IF;

  SELECT id INTO v_fuel_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND account_number = '5000'
     AND account_type = 'CostOfGoodsSold'
     AND deactivated_at IS NULL
     AND is_postable = true
   LIMIT 1;
  IF v_fuel_account IS NULL THEN
    RAISE NOTICE 'USMCA account 5000 Fuel & Diesel not found or not postable -- skipping seed';
    RETURN;
  END IF;

  INSERT INTO accounting.chart_of_accounts_roles (
    operating_company_id, role, account_id, is_active, created_at, updated_at
  )
  VALUES (v_usmca, 'company_fuel_advance_expense', v_fuel_account, true, now(), now())
  ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
    SET account_id = EXCLUDED.account_id, updated_at = now();
END $$;
