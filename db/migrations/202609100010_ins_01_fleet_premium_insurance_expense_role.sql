-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] INS-01 — fleet premium posts via insurance_expense role.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: pickFleetPremiumAccounts used ORDER BY created_at LIMIT 2 (arbitrary CoA).
-- Fix: designate insurance_expense per entity; credit leg stays ap_control. Fail-closed if unbound.
-- Cursor band 20260901xxxx. Idempotent. Does NOT enable posting flags.

BEGIN;

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
        'insurance_expense'
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
          'insurance_expense'
        ])
      );
  END IF;
END
$$;

-- Bind insurance_expense to the entity's designated truck/vehicle insurance expense account.
-- Deterministic name/number match — NEVER ORDER BY created_at.
DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'INS-01: chart_of_accounts_roles absent — skip bind';
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
        (rec.code = 'TRANSP' AND (
          a.account_number = 'QBO-7'
          OR a.account_name ILIKE 'Vehicle Insurance Expenses'
        ))
        OR (rec.code = 'TRK' AND (
          a.account_number IN ('QBO-854', 'TRK-QBO-7')
          OR a.account_name ILIKE 'OC-Truck Insurance'
          OR a.account_name ILIKE 'Vehicle Insurance Expenses'
        ))
        OR (rec.code = 'USMCA' AND (
          a.account_number = '5600'
          OR a.account_name ILIKE 'Truck Insurance'
          OR a.account_name ILIKE 'Insurance Expense'
        ))
      )
    ORDER BY
      CASE
        WHEN rec.code = 'TRANSP' AND a.account_number = 'QBO-7' THEN 0
        WHEN rec.code = 'TRK' AND a.account_number = 'QBO-854' THEN 0
        WHEN rec.code = 'TRK' AND a.account_number = 'TRK-QBO-7' THEN 1
        WHEN rec.code = 'USMCA' AND a.account_number = '5600' THEN 0
        WHEN a.account_name ILIKE 'Truck Insurance' THEN 1
        WHEN a.account_name ILIKE 'Vehicle Insurance Expenses' THEN 2
        WHEN a.account_name ILIKE 'Insurance Expense' THEN 3
        WHEN a.account_name ILIKE 'OC-Truck Insurance' THEN 1
        ELSE 9
      END,
      a.account_number NULLS LAST
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE NOTICE 'INS-01: no insurance expense account for % — leave insurance_expense unbound (fail-closed)', rec.code;
      CONTINUE;
    END IF;

    UPDATE accounting.chart_of_accounts_roles r
       SET is_active = false,
           updated_at = now()
     WHERE r.operating_company_id = rec.company_id
       AND r.role = 'insurance_expense'
       AND r.is_active = true
       AND r.account_id IS DISTINCT FROM v_acct;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'insurance_expense', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  END LOOP;
END
$$;

COMMIT;
