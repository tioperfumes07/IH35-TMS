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
--
-- ACCT-F5684 (checksum-override edit, applied file unchanged in EFFECT on prod) — §0 below is a
-- NEW, additive-only defensive pre-widen of accounting.chart_of_accounts_roles_role_check. Added
-- because this file's own §3 INSERT below writes role values ('depr_expense_default',
-- 'accum_depr_default') that the CHECK constraint did not yet permit at the time this migration
-- FIRST ran on prod on 2026-08-18 — it only succeeded there because a LATER-NUMBERED file,
-- 202609100050_fa_archive_fixed_assets_schema_coa_roles.sql (a HELD financial-cluster migration
-- per db/migrations/.held-migrations.json), had already been Neon-applied by the owner OUT OF
-- FILENAME ORDER on 2026-07-28 (three weeks before this file's own 2026-08-18 apply date),
-- pre-widening the constraint. A FRESH database replay (CI, local dev, a disposable Neon
-- rehearsal branch) applies files in strict filename-sort order and never sees that manual
-- out-of-order apply — so on a fresh DB, THIS file (202608180900) reaches its own INSERT before
-- the later, held 202609100050 file ever runs and widens the constraint, and the fresh-DB migrate
-- step fails on a CHECK violation every time (confirmed live via `gh run view` on origin/main,
-- 2026-08-21). §0 makes this file self-sufficient on any replay order by hardcoding the SAME
-- full role list 202609100050 documents as "TRUE SUPERSET of live prod Neon 2026-07-28" (verified
-- again directly against the live prod constraint before writing this, 2026-08-21 — identical).
-- On a database where 202609100050 has already run (prod, and any fresh replay ordering that
-- happens to reach it first), §0's DROP+ADD is a pure no-op (same constraint, same values) or is
-- itself immediately superseded when 202609100050 later runs its own DROP+ADD — either way the
-- final constraint state converges to the same superset regardless of order. §0 does not touch
-- fixed_asset_default (not needed by this file's own INSERT) beyond including it in the same
-- superset list, for the same no-op-or-converge reason. This file's checksum on prod (recorded
-- 2026-08-18) is registered in scripts/lib/migration-checksum-overrides.json so db:migrate does
-- NOT attempt to re-run this changed content against prod — prod already has the correct
-- end-state and this edit changes nothing about what already ran there.

BEGIN;

-- §0 — ACCT-F5684 defensive pre-widen (see header). Idempotent; safe to run before or after
-- 202609100050 has run; converges to the identical final constraint either way.
DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN
    ALTER TABLE accounting.chart_of_accounts_roles
      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
    ALTER TABLE accounting.chart_of_accounts_roles
      ADD CONSTRAINT chart_of_accounts_roles_role_check
      CHECK (role IN (
        'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
        'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
        'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
        'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
        'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
        'default_interest_expense','factor_reserve_held','factor_fee_expense',
        'property_tax_expense','property_tax_payable',
        'driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
        'advance_recovery','damage_recovery','lease_recovery','insurance_recovery',
        'fuel_advance_recovery','other_recovery',
        'abandonment_chargeback_recovery',
        'cash_dip',
        'civil_fines_expense',
        'maintenance_parts_expense',
        'warranty_recovery',
        'fuel_overage_receivable',
        'factor_wire_fee',
        'insurance_expense',
        'unbilled_revenue',
        'fixed_asset_default',
        'accum_depr_default',
        'depr_expense_default',
        'heavy_repair_expense',
        'prepaid_asset_default',
        'amortization_expense_default',
        'broker_customer_advance_liability',
        'rent_expense',
        'related_party_interest_expense',
        'operating_bank',
        'settlement_dispute_correction_recovery'
      ));
  END IF;
END
$$;

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
