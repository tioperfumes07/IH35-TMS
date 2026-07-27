-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] FUEL-04 — Driver Fuel-Overage Receivable (Asset).
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
--
-- ROOT CAUSE: FUEL-03 overage engine has nowhere to post — catalogs.accounts has no
--   "Driver Fuel-Overage Receivable". Owner A3c: dedicated receivable, NEVER Cash Advance.
--
-- FIX: seed account 1250 (Asset / OtherCurrentAsset / is_postable) per TRANSP/TRK/USMCA with
--   system_purpose = driver_fuel_overage_receivable; widen CoA-role CHECKs for role
--   fuel_overage_receivable; bind chart_of_accounts_roles. NEVER touch advance_recovery.
-- No new GL math. No posting-flag flip. No QBO write-back.
-- RENUMBER 2026-07-27 (BAND FIX): was 202609090000_fuel_04_driver_fuel_overage_receivable.sql —
-- outside Cursor band 20260901xxxx–20260910xxxx. Body unchanged; Neon dual-ledger stamp follows.

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
  '1250',
  'Driver Fuel-Overage Receivable',
  'Asset',
  'OtherCurrentAsset',
  'driver_fuel_overage_receivable',
  true
FROM org.companies c
WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (
        a.account_number = '1250'
        OR a.account_name = 'Driver Fuel-Overage Receivable'
        OR a.system_purpose = 'driver_fuel_overage_receivable'
      )
  );

-- §2 — Widen role CHECKs (TRUE SUPERSET of live 2026-07-26 list + fuel_overage_receivable).
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
        'fuel_overage_receivable'
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
          'fuel_overage_receivable'
        ])
      );
  END IF;
END
$$;

-- §3 — Bind role → 1250. NEVER touch advance_recovery.
DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'FUEL-04: chart_of_accounts_roles absent — skip bind';
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
      AND a.system_purpose = 'driver_fuel_overage_receivable'
      AND a.account_type = 'Asset'
      AND a.is_postable IS TRUE
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'FUEL-04: missing Driver Fuel-Overage Receivable for company %', rec.code;
    END IF;

    UPDATE accounting.chart_of_accounts_roles r
       SET is_active = false,
           updated_at = now()
     WHERE r.operating_company_id = rec.company_id
       AND r.role = 'fuel_overage_receivable'
       AND r.is_active = true
       AND r.account_id IS DISTINCT FROM v_acct;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'fuel_overage_receivable', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  END LOOP;
END
$$;

COMMIT;
