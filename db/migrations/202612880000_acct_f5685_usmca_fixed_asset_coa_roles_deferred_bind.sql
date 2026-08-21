-- ACCT-F5685 — deferred completion of 202608180900's USMCA fixed-asset CoA-role bind
-- (depr_expense_default / accum_depr_default), for the case where that file's own INSERT skipped
-- gracefully because accounting.chart_of_accounts_roles_role_check did not yet permit those role
-- values at the moment it ran (a fresh database replay, where 202608180900 runs before the HELD
-- migration 202609100050_fa_archive_fixed_assets_schema_coa_roles.sql widens the constraint —
-- see 202608180900's own header comment for the full mechanism).
--
-- This migration is numbered to run at the very end of the current migration chain — after
-- every constraint-touching migration, including the HELD one — so by the time it runs, the
-- constraint is guaranteed to already permit both role values on ANY database (fresh or prod).
--
-- On PROD, this is a genuine no-op: 202608180900 already bound both roles successfully back on
-- 2026-08-18 (the constraint was already wide there at that time), so the idempotent guards below
-- find both roles already bound and do nothing.
--
-- On a fresh database, this completes exactly the bind 202608180900 deferred, using the
-- identical seed/resolve/bind logic, reusing the SAME idempotent NOT EXISTS / ON CONFLICT
-- patterns already established there — no new GL math, no new accounting decision, purely
-- finishing a bind that was always intended to happen.
--
-- Idempotent · resolves USMCA by org.companies.code · never hardcoded UUID · NOTICE+skip on a
-- fresh/partial DB · additive only.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_depr_expense_acct uuid;
  v_accum_depr_acct uuid;
  v_already_bound boolean;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL
     OR to_regclass('accounting.chart_of_accounts_roles') IS NULL
     OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'ACCT-F5685: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_usmca
    FROM org.companies
   WHERE code = 'USMCA' AND deactivated_at IS NULL
   LIMIT 1;

  IF v_usmca IS NULL THEN
    RAISE NOTICE 'ACCT-F5685: USMCA company absent — skip';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
     WHERE operating_company_id = v_usmca
       AND role IN ('depr_expense_default', 'accum_depr_default')
       AND is_active
  ) INTO v_already_bound;

  IF v_already_bound THEN
    RAISE NOTICE 'ACCT-F5685: USMCA fixed-asset CoA roles already bound (by 202608180900, normal apply order) — nothing to do';
    RETURN;
  END IF;

  -- Re-resolve the same two accounts 202608180900 seeds/tags — by the time this migration runs,
  -- that file has already run (earlier in filename order) and either bound the roles directly or
  -- skipped; either way the accounts themselves exist.
  SELECT id INTO v_depr_expense_acct
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND deactivated_at IS NULL
     AND system_purpose = 'depr_expense_default'
     AND account_type = 'OtherExpense'
     AND is_postable IS TRUE
   LIMIT 1;

  SELECT id INTO v_accum_depr_acct
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND deactivated_at IS NULL
     AND account_number = '1600'
     AND account_type = 'Asset'
     AND is_postable IS TRUE
   LIMIT 1;

  IF v_depr_expense_acct IS NULL THEN
    RAISE EXCEPTION 'ACCT-F5685: missing Depreciation Expense account for USMCA — 202608180900 should have seeded this; check apply order';
  END IF;
  IF v_accum_depr_acct IS NULL THEN
    RAISE EXCEPTION 'ACCT-F5685: missing Accumulated Depreciation (1600) account for USMCA';
  END IF;

  -- By construction, the constraint permits both role values here: every migration that touches
  -- chart_of_accounts_roles_role_check, including the HELD one, has already run by this point in
  -- filename order.
  INSERT INTO accounting.chart_of_accounts_roles (
    operating_company_id, role, account_id, is_active, created_at, updated_at
  )
  VALUES (v_usmca, 'depr_expense_default', v_depr_expense_acct, true, now(), now())
  ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
    SET account_id = EXCLUDED.account_id, updated_at = now();

  INSERT INTO accounting.chart_of_accounts_roles (
    operating_company_id, role, account_id, is_active, created_at, updated_at
  )
  VALUES (v_usmca, 'accum_depr_default', v_accum_depr_acct, true, now(), now())
  ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
    SET account_id = EXCLUDED.account_id, updated_at = now();

  RAISE NOTICE 'ACCT-F5685: deferred bind completed — USMCA depr_expense_default=% accum_depr_default=%',
    v_depr_expense_acct, v_accum_depr_acct;
END
$$;

COMMIT;
