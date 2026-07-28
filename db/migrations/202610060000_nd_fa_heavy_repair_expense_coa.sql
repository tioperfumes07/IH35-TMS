-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] ND-FA-01 / A4-D2 — Heavy Repair Expense CoA + role.
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
--
-- ROOT CAUSE: capitalize-vs-expense threshold ($7,000) has a Fixed Asset path, but the expense path
--   has no designated "Heavy Repair Expense" account — posters cannot resolve A4-D2.
--
-- FIX: seed Expense account 6150 "Heavy Repair Expense" (OtherExpense / VehicleRepairs) per
--   TRANSP/TRK/USMCA with system_purpose = heavy_repair_expense; widen CoA-role CHECKs for role
--   heavy_repair_expense (TRUE SUPERSET of live Neon 2026-07-28 CHECK including unbilled_revenue +
--   fixed_asset_*); bind accounting.chart_of_accounts_roles.
-- No new GL math. No posting-flag flip. No QBO write-back. Additive only (Rule 07).

BEGIN;

-- §1 — Account seed (additive; never rename/delete).
INSERT INTO catalogs.accounts (
  operating_company_id,
  account_number,
  account_name,
  account_type,
  account_subtype,
  system_purpose,
  is_postable
)
SELECT
  c.id,
  '6150',
  'Heavy Repair Expense',
  'OtherExpense',
  'VehicleRepairs',
  'heavy_repair_expense',
  true
FROM org.companies c
WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (
        a.account_number = '6150'
        OR a.account_name = 'Heavy Repair Expense'
        OR a.system_purpose = 'heavy_repair_expense'
      )
  );

-- §2 — Widen role CHECKs (TRUE SUPERSET of live Neon 2026-07-28 lucia + heavy_repair_expense).
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
        'heavy_repair_expense'
      ));
  END IF;

  IF to_regclass('catalogs.account_role_bindings') IS NOT NULL THEN
    ALTER TABLE catalogs.account_role_bindings
      DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
    ALTER TABLE catalogs.account_role_bindings
      ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
        role_key = ANY (ARRAY[
          'ar_clearing', 'ap_clearing', 'cash_dip', 'cash_payroll', 'cash_petty',
          'fuel_expense', 'maintenance_expense', 'driver_payroll_clearing',
          'factor_advances_receivable', 'factor_chargebacks_payable', 'undeposited_funds',
          'driver_pay_expense', 'reimbursement_expense',
          'advance_recovery', 'damage_recovery', 'lease_recovery', 'insurance_recovery',
          'fuel_advance_recovery', 'other_recovery',
          'rental_income', 'lease_receivable', 'interest_income', 'gain_loss_on_disposal',
          'factoring_advance_liability', 'ar_assigned_to_factor', 'factoring_recoursed_ar',
          'default_interest_expense', 'factor_reserve_held', 'factor_fee_expense',
          'property_tax_expense', 'property_tax_payable',
          'abandonment_chargeback_recovery',
          'civil_fines_expense',
          'maintenance_parts_expense',
          'warranty_recovery',
          'fuel_overage_receivable',
          'factor_wire_fee',
          'insurance_expense',
          'unbilled_revenue',
          'heavy_repair_expense'
        ])
      );
  END IF;
END
$$;

-- §3 — Bind role → 6150. Fail closed if account missing (NOTICE only — no invent).
DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'ND-FA Heavy Repair: chart_of_accounts_roles absent — skip bind';
    RETURN;
  END IF;

  FOR rec IN
    SELECT c.id AS company_id, c.code
    FROM org.companies c
    WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  LOOP
    SELECT a.id INTO v_acct
    FROM catalogs.accounts a
    WHERE a.operating_company_id = rec.company_id
      AND a.deactivated_at IS NULL
      AND (
        a.system_purpose = 'heavy_repair_expense'
        OR a.account_name = 'Heavy Repair Expense'
        OR a.account_number = '6150'
      )
    ORDER BY CASE WHEN a.system_purpose = 'heavy_repair_expense' THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE NOTICE 'ND-FA Heavy Repair: % missing account 6150 — leave role unbound', rec.code;
      CONTINUE;
    END IF;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'heavy_repair_expense', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  END LOOP;
END
$$;

COMMIT;
