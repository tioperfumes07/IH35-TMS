-- ACCT-F5434 — bind depr_expense_default + accum_depr_default CoA roles for USMCA.
--
-- ROOT CAUSE: 202608121800_usmca_posting_on_qbo_off.sql force-enabled every TMS posting-class
--   flag for USMCA, including FIXED_ASSET_AUTOPOST_ENABLED, without checking whether that flag's
--   required control accounts were bound. verify-posting-flags-require-bound-accounts.mjs
--   correctly flags this: config/posting-flag-requirements.json requires
--   FIXED_ASSET_AUTOPOST_ENABLED -> [depr_expense_default, accum_depr_default], and Neon-confirmed
--   live (2026-08-18) neither role has a chart_of_accounts_roles row for USMCA. USMCA has 0
--   accounting.fixed_assets rows today (dormant, not firing) but would throw
--   CoaRoleResolutionError on the first USMCA fixed-asset depreciation event.
--
-- FIX: USMCA already has account 1600 "Accumulated Depreciation" (Asset, is_postable) — seeded
--   ahead of need, unbound. Bind it to accum_depr_default. USMCA has no Depreciation Expense
--   account yet — seed one at 6860 (OtherExpense, mirroring 6850 Amortization Expense's shape,
--   the nearest sibling account on USMCA's own CoA) and bind it to depr_expense_default.
--
-- Idempotent · resolves USMCA by org.companies.code · never hardcoded UUID · NOTICE+skip on a
-- fresh/partial DB · additive only (no existing account renamed/deleted) · does not touch
-- TRANSP or TRK (each entity's fixed-asset CoA roles are bound independently; TRK's own
-- accum_depr_default gap is a separate, already-tracked item).

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_depr_expense_acct uuid;
  v_accum_depr_acct uuid;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL
     OR to_regclass('accounting.chart_of_accounts_roles') IS NULL
     OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'ACCT-F5434: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_usmca
    FROM org.companies
   WHERE code = 'USMCA' AND deactivated_at IS NULL
   LIMIT 1;

  IF v_usmca IS NULL THEN
    RAISE NOTICE 'ACCT-F5434: USMCA company absent — skip';
    RETURN;
  END IF;

  -- §1 — Seed 6860 Depreciation Expense for USMCA if not already present (additive; never
  -- rename/delete an existing account — mirrors the NOT EXISTS guard used by prior CoA seeds).
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_usmca, '6860', 'Depreciation Expense', 'OtherExpense', 'Depreciation',
         'depr_expense_default', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
     WHERE a.operating_company_id = v_usmca
       AND a.deactivated_at IS NULL
       AND (a.account_number = '6860' OR a.system_purpose = 'depr_expense_default')
  );

  -- §2 — Tag the existing 1600 Accumulated Depreciation account's system_purpose if unset, same
  -- convention as 1410/6850 on this entity's own CoA. Never touches the account if it already
  -- carries a different system_purpose (would mean it's bound to something else already).
  UPDATE catalogs.accounts
     SET system_purpose = 'accum_depr_default', updated_at = now()
   WHERE operating_company_id = v_usmca
     AND account_number = '1600'
     AND deactivated_at IS NULL
     AND system_purpose IS NULL;

  -- §3 — Resolve both accounts (post-seed) and bind the roles.
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
    RAISE EXCEPTION 'ACCT-F5434: missing Depreciation Expense account for USMCA after seed';
  END IF;
  IF v_accum_depr_acct IS NULL THEN
    RAISE EXCEPTION 'ACCT-F5434: missing Accumulated Depreciation (1600) account for USMCA';
  END IF;

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

  RAISE NOTICE 'ACCT-F5434: USMCA depr_expense_default=% accum_depr_default=% bound',
    v_depr_expense_acct, v_accum_depr_acct;
END
$$;

COMMIT;
