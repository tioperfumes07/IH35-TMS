-- MONEY WO §2 — enable held posting flags PREPAID + FH3 (owner AUTO 2026-07-29).
-- Neon 2026-07-29 (lucia): prepaid_asset_default + amortization_expense_default already active on
-- TRK and USMCA; PREPAID_EXPENSES_POST_ENABLED / FINANCE_HUB_AMORTIZATION_POST_ENABLED still false.
-- FACTORING_GL_POSTING_ENABLED already ON TRANSP+USMCA / OFF TRK (#3737) — untouched here.
-- FIXED_ASSET_AUTOPOST_ENABLED NOT enabled in this migration: TRK has per-unit Accumulated
-- Depreciation accounts but no accum_depr_default control binding; enabling FA without that (or a
-- proven per-unit resolver path) would be a balance-sheet guess. Separate ACCT-F44.
-- NEVER touches QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED.
-- NOTICE+skip on missing roles/companies — never RAISE (fresh-DB safe). Rule 19: no reserves.

BEGIN;

DO $$
DECLARE
  v_trk uuid;
  v_usmca uuid;
  v_setter uuid;
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL
     OR to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'HELD-FLAGS-ENABLE: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' AND deactivated_at IS NULL LIMIT 1;
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;

  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;
  IF v_setter IS NULL THEN
    RAISE NOTICE 'HELD-FLAGS-ENABLE: no existing flag setter (unprovisioned DB) — skip';
    RETURN;
  END IF;

  -- PREPAID_EXPENSES_POST_ENABLED — TRK
  IF v_trk IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_trk AND role = 'prepaid_asset_default' AND is_active
  ) THEN
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), 'PREPAID_EXPENSES_POST_ENABLED', v_trk, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
  ELSE
    RAISE NOTICE 'HELD-FLAGS-ENABLE: skip PREPAID TRK — prepaid_asset_default unbound or no TRK';
  END IF;

  -- PREPAID_EXPENSES_POST_ENABLED — USMCA
  IF v_usmca IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_usmca AND role = 'prepaid_asset_default' AND is_active
  ) THEN
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), 'PREPAID_EXPENSES_POST_ENABLED', v_usmca, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
  ELSE
    RAISE NOTICE 'HELD-FLAGS-ENABLE: skip PREPAID USMCA — prepaid_asset_default unbound or no USMCA';
  END IF;

  -- FINANCE_HUB_AMORTIZATION_POST_ENABLED — TRK
  IF v_trk IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_trk AND role = 'amortization_expense_default' AND is_active
  ) THEN
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), 'FINANCE_HUB_AMORTIZATION_POST_ENABLED', v_trk, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
  ELSE
    RAISE NOTICE 'HELD-FLAGS-ENABLE: skip FH3 POST TRK — amortization_expense_default unbound or no TRK';
  END IF;

  -- FINANCE_HUB_AMORTIZATION_POST_ENABLED — USMCA
  IF v_usmca IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_usmca AND role = 'amortization_expense_default' AND is_active
  ) THEN
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), 'FINANCE_HUB_AMORTIZATION_POST_ENABLED', v_usmca, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
  ELSE
    RAISE NOTICE 'HELD-FLAGS-ENABLE: skip FH3 POST USMCA — amortization_expense_default unbound or no USMCA';
  END IF;

  RAISE NOTICE 'HELD-FLAGS-ENABLE: PREPAID + FH3 POST enable attempted for TRK/USMCA (role-gated)';
END
$$;

COMMIT;
