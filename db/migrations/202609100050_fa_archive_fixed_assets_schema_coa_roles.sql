-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] Fixed-assets canonicalization (Cursor lane).
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. ***
--
-- Decision (owner 2026-07-27): accounting.fixed_assets is CANONICAL.
-- Archive the orphaned fixed_assets.* schema (Rule 07 — NEVER DROP; both registers verified
-- 0 rows on Neon lucia). Claude owns the 87-unit TRK backfill + its guard.
--
-- This migration:
--   §1 RENAME SCHEMA fixed_assets → fixed_assets_archived (tables kept, reachable for forensics)
--   §2 REVOKE write grants on archived tables from ih35_app (SELECT retained)
--   §3 Widen CoA role CHECKs for fixed_asset_default / accum_depr_default / depr_expense_default
--   §4 Seed TRK role binds where a honest CoA account exists (asset + depr expense);
--      accum_depr_default left UNBOUND (QBO only has per-unit Accum Depr — Claude/backfill
--      sets accounting.fixed_assets.accum_depr_account_id per row; role fails closed until owner
--      designates a rollup if desired)
--
-- Posts nothing. Does NOT flip AMORTIZATION_GL_POSTING_ENABLED / FIXED_ASSET_AUTOPOST_ENABLED.
-- Idempotent / fresh-DB-safe.

BEGIN;

-- §1 — Archive orphan schema (never DROP) ----------------------------------------------------------
-- IMPORTANT: keep `ALTER SCHEMA … RENAME TO` as a bare statement inside the DO block (NOT
-- EXECUTE '…'). scripts/lib/migration-content-verifier.mjs masks string literals, so an EXECUTE
-- form would hide the rename from content-drift and falsely report fixed_assets.* as missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'fixed_assets')
     AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'fixed_assets_archived') THEN
    ALTER SCHEMA fixed_assets RENAME TO fixed_assets_archived;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'fixed_assets_archived') THEN
    COMMENT ON SCHEMA fixed_assets_archived IS
      'ARCHIVED 2026-07-27 — orphan FH1 register. Canonical register is accounting.fixed_assets. Rule 07: never DROP. 0-row at archive time on Neon prod.';
  END IF;
END
$$;

-- §2 — Stop-write on archived tables (ih35_app) ----------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF to_regnamespace('fixed_assets_archived') IS NULL THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'fixed_assets_archived.asset_classes',
    'fixed_assets_archived.assets',
    'fixed_assets_archived.depreciation_schedules',
    'fixed_assets_archived.disposals'
  ]
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM ih35_app', t);
      EXECUTE format('GRANT SELECT ON %s TO ih35_app', t);
    END IF;
  END LOOP;
END
$$;

-- §3 — Widen CoA role CHECKs (TRUE SUPERSET of live prod Neon 2026-07-28 lucia proof).
-- Live CHECK already admits unbilled_revenue (DISP-01). DROP+ADD without it rejects live rows.
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
        -- Fixed-asset defaults (row columns still authoritative for FIN-21 posting)
        'fixed_asset_default',
        'accum_depr_default',
        'depr_expense_default'
      ));
  END IF;
END
$$;

-- §4 — Seed TRK designations (honest CoA matches only) --------------------------------------------
DO $$
DECLARE
  v_trk uuid;
  v_asset uuid;
  v_depr_exp uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'FA-ARCHIVE: chart_of_accounts_roles absent — skip binds';
    RETURN;
  END IF;

  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' LIMIT 1;
  IF v_trk IS NULL THEN
    RAISE NOTICE 'FA-ARCHIVE: TRK company missing — skip binds';
    RETURN;
  END IF;

  -- Asset control: FIXED ASSETS- IH 35 TRACTORS (Claude maps flatbed/reefer classes per unit).
  SELECT a.id INTO v_asset
  FROM catalogs.accounts a
  WHERE a.operating_company_id = v_trk
    AND a.deactivated_at IS NULL
    AND a.account_number = 'QBO-1193'
  LIMIT 1;

  -- Depreciations expense rollup (Truck Depreciation QBO-1150040035 preferred).
  SELECT a.id INTO v_depr_exp
  FROM catalogs.accounts a
  WHERE a.operating_company_id = v_trk
    AND a.deactivated_at IS NULL
    AND a.account_number = 'QBO-1150040035'
  LIMIT 1;

  IF v_asset IS NOT NULL THEN
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (v_trk, 'fixed_asset_default', v_asset, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  ELSE
    RAISE NOTICE 'FA-ARCHIVE: TRK QBO-1193 missing — leave fixed_asset_default unbound';
  END IF;

  IF v_depr_exp IS NOT NULL THEN
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (v_trk, 'depr_expense_default', v_depr_exp, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  ELSE
    RAISE NOTICE 'FA-ARCHIVE: TRK Truck Depreciation missing — leave depr_expense_default unbound';
  END IF;

  -- accum_depr_default: intentionally NOT seeded — no rollup Accum Depr on TRK CoA (per-unit only).
  RAISE NOTICE 'FA-ARCHIVE: accum_depr_default left unbound (per-unit QBO Accum Depr; Claude sets row columns)';
END
$$;

COMMIT;
