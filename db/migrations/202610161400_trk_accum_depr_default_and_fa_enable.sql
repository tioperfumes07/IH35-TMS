-- ACCT-F44 — TRK accum_depr_default control account + enable FIXED_ASSET_AUTOPOST (owner AUTO).
-- Neon 2026-07-29: TRK has depr_expense_default + many per-unit Accumulated Depreciation accounts,
-- but no accum_depr_default role. verify-posting-flags-require-bound-accounts requires BOTH legs
-- before FIXED_ASSET_AUTOPOST_ENABLED may be ON. TRANSP excluded (leases). USMCA stays OFF.
-- Creates ONE generic control account (never rebinds a Unit/Flatbed AD account). Rule 19: no reserves.
-- NEVER touches QBO_JE_PUSH / QBO_ENTITY_PUSH. NOTICE+skip, never RAISE.

BEGIN;

DO $$
DECLARE
  v_trk uuid;
  v_setter uuid;
  v_acct uuid;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL
     OR to_regclass('accounting.chart_of_accounts_roles') IS NULL
     OR to_regclass('lib.feature_flag_overrides') IS NULL THEN
    RAISE NOTICE 'ACCT-F44: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' AND deactivated_at IS NULL LIMIT 1;
  IF v_trk IS NULL THEN
    RAISE NOTICE 'ACCT-F44: no TRK company — skip';
    RETURN;
  END IF;

  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;
  IF v_setter IS NULL THEN
    RAISE NOTICE 'ACCT-F44: no flag setter (unprovisioned DB) — skip';
    RETURN;
  END IF;

  -- Prefer an existing non-unit control AD account; never steal Unit/Flatbed/FB ledgers.
  SELECT a.id INTO v_acct
  FROM catalogs.accounts a
  WHERE a.operating_company_id = v_trk
    AND a.deactivated_at IS NULL
    AND (
      a.system_purpose = 'accum_depr_default'
      OR (
        a.account_subtype = 'AccumulatedDepreciation'
        AND a.account_name ~* 'accumulated depreciation'
        AND a.account_name !~* '(unit|flatbed|#|fb[- ])'
      )
    )
  ORDER BY CASE WHEN a.system_purpose = 'accum_depr_default' THEN 0
                WHEN a.account_name ILIKE 'Accumulated Depreciation' THEN 1
                ELSE 2 END,
           a.created_at
  LIMIT 1;

  IF v_acct IS NULL THEN
    INSERT INTO catalogs.accounts (
      operating_company_id, account_number, account_name, account_type, account_subtype,
      system_purpose, is_postable, currency_code, is_locked, is_billable_expense
    )
    VALUES (
      v_trk, '1500', 'Accumulated Depreciation', 'Asset', 'AccumulatedDepreciation',
      'accum_depr_default', true, 'USD', false, false
    )
    RETURNING id INTO v_acct;
    RAISE NOTICE 'ACCT-F44: created TRK control Accumulated Depreciation %', v_acct;
  ELSE
    UPDATE catalogs.accounts
       SET system_purpose = COALESCE(NULLIF(system_purpose, ''), 'accum_depr_default')
     WHERE id = v_acct AND operating_company_id = v_trk;
  END IF;

  -- Bind / refresh accum_depr_default
  IF EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_trk AND role = 'accum_depr_default'
  ) THEN
    UPDATE accounting.chart_of_accounts_roles
       SET account_id = v_acct, is_active = true
     WHERE operating_company_id = v_trk AND role = 'accum_depr_default';
  ELSE
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (v_trk, 'accum_depr_default', v_acct, true);
  END IF;

  -- Gate: both FA legs must be active before enable
  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_trk AND role = 'depr_expense_default' AND is_active
  ) OR NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
    WHERE operating_company_id = v_trk AND role = 'accum_depr_default' AND is_active
  ) THEN
    RAISE NOTICE 'ACCT-F44: FA legs incomplete after bind — NOT enabling FIXED_ASSET_AUTOPOST';
    RETURN;
  END IF;

  INSERT INTO lib.feature_flag_overrides
    (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
  VALUES (gen_random_uuid(), 'FIXED_ASSET_AUTOPOST_ENABLED', v_trk, NULL, true, v_setter, now(), NULL)
  ON CONFLICT (flag_key, operating_company_id)
    WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
    DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;

  RAISE NOTICE 'ACCT-F44: FIXED_ASSET_AUTOPOST_ENABLED ON for TRK (accum_depr_default bound)';
END
$$;

COMMIT;
