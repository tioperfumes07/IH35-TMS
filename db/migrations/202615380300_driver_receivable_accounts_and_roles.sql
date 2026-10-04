-- ROUND 394 RULING 2 (CC-1) — DAMAGE, FINES AND NEGATIVE SETTLEMENTS ARE DRIVER RECEIVABLES.
--
-- The driver owes the company. Today these three create NO general-ledger entry at all (driver_finance.driver_liabilities
-- only), and mark-paid-off / void zero a stored number with no entry — money owed by a driver that the ledger has never
-- heard of. Step 1 of the ruling's order (accounts and roles first, then the posting paths, then drop the stored copies):
--   1255 Driver Damage Receivable               role driver_damage_receivable
--   1256 Driver Fine Receivable                 role driver_fine_receivable
--   1257 Driver Negative Settlement Receivable  role driver_negative_settlement_receivable
-- Asset / OtherCurrentAsset, postable, top-level — beside 1245 Driver Cash Advances Receivable and 1250 Driver
-- Fuel-Overage Receivable. USMCA only (TRANSP and TRK are frozen). The company is resolved by CODE, never a UUID; every
-- insert is idempotent (WHERE NOT EXISTS / ON CONFLICT).
--
-- chart_of_accounts_roles_role_check is widened as a full literal superset (the live 69 roles measured 2026-10-04 on
-- production ∪ every registered COA_ROLE_VALUES role ∪ the three new ones; the four lease-to-own roles stay with their held
-- migration 202615210000 — KNOWN_UNREGISTERED in the guard) — verify-coa-role-values-registered-in-check-constraint
-- reads the newest widen as authoritative — and the widen refuses to apply if any existing role row would fall outside it.

DO $receivables$
DECLARE
  v_co uuid;
BEGIN
  SELECT id INTO v_co FROM org.companies WHERE code = 'USMCA';
  IF v_co IS NULL THEN
    RAISE NOTICE '202615380300: no USMCA company on this database (fresh DB) — nothing to create';
    RETURN;
  END IF;
  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable, system_purpose)
  SELECT v_co, x.num, x.name, 'Asset', 'OtherCurrentAsset', true, x.purpose
    FROM (VALUES
      ('1255', 'Driver Damage Receivable', 'driver_damage_receivable'),
      ('1256', 'Driver Fine Receivable', 'driver_fine_receivable'),
      ('1257', 'Driver Negative Settlement Receivable', 'driver_negative_settlement_receivable')
    ) AS x(num, name, purpose)
   WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id = v_co AND a.account_number = x.num);
END
$receivables$;

DO $widen$
DECLARE
  v_allowed text[] := ARRAY[
    'abandonment_chargeback_recovery',
    'accessorial_revenue',
    'accum_depr_default',
    'advance_recovery',
    'amortization_expense_default',
    'ap_control',
    'ar_assigned_to_factor',
    'ar_control',
    'bad_debt_expense',
    'bank_fee_recovery',
    'broker_customer_advance_liability',
    'cash_basis_adjustment_equity',
    'cash_clearing',
    'cash_dip',
    'civil_fines_expense',
    'company_fuel_advance_expense',
    'damage_recovery',
    'default_interest_expense',
    'depr_expense_default',
    'detention_pay_expense',
    'driver_damage_receivable',
    'driver_fine_receivable',
    'driver_negative_settlement_receivable',
    'driver_pay_expense',
    'driver_payroll_clearing',
    'driver_settlements_payable',
    'escrow_liability_default',
    'expense_default',
    'factor_cash_reserve_deficit_payable',
    'factor_cash_reserve_held',
    'factor_default_interest_payable',
    'factor_fee_expense',
    'factor_reserve_default',
    'factor_reserve_held',
    'factor_transaction_fee',
    'factor_wire_fee',
    'factoring_advance_liability',
    'factoring_recoursed_ar',
    'fixed_asset_default',
    'fuel_advance_recovery',
    'fuel_card_payable_dreamline',
    'fuel_overage_receivable',
    'fuel_wallet_relay',
    'gain_loss_on_disposal',
    'heavy_repair_expense',
    'insurance_expense',
    'insurance_recovery',
    'intercompany_receivable_ih35_transportation',
    'interest_income',
    'interest_receivable',
    'lease_receivable',
    'lease_recovery',
    'maintenance_parts_expense',
    'operating_bank',
    'other_operating_expense',
    'other_recovery',
    'prepaid_asset_default',
    'property_tax_expense',
    'property_tax_payable',
    'reimbursement_expense',
    'related_party_interest_expense',
    'rent_expense',
    'rental_income',
    'retained_earnings',
    'revenue_default',
    'sales_tax_payable',
    'settlement_dispute_correction_recovery',
    'toll_scale_expense',
    'unbilled_revenue',
    'uncategorized_expense',
    'undeposited_funds',
    'warranty_recovery'
  ];
  v_outside text;
BEGIN
  SELECT string_agg(DISTINCT r.role, ', ') INTO v_outside FROM accounting.chart_of_accounts_roles r WHERE NOT (r.role = ANY (v_allowed));
  IF v_outside IS NOT NULL THEN
    RAISE EXCEPTION '202615380300: existing role rows fall outside the widened CHECK: % — refusing to drop the constraint', v_outside;
  END IF;
END
$widen$;

ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role IN (
    'abandonment_chargeback_recovery',
    'accessorial_revenue',
    'accum_depr_default',
    'advance_recovery',
    'amortization_expense_default',
    'ap_control',
    'ar_assigned_to_factor',
    'ar_control',
    'bad_debt_expense',
    'bank_fee_recovery',
    'broker_customer_advance_liability',
    'cash_basis_adjustment_equity',
    'cash_clearing',
    'cash_dip',
    'civil_fines_expense',
    'company_fuel_advance_expense',
    'damage_recovery',
    'default_interest_expense',
    'depr_expense_default',
    'detention_pay_expense',
    'driver_damage_receivable',
    'driver_fine_receivable',
    'driver_negative_settlement_receivable',
    'driver_pay_expense',
    'driver_payroll_clearing',
    'driver_settlements_payable',
    'escrow_liability_default',
    'expense_default',
    'factor_cash_reserve_deficit_payable',
    'factor_cash_reserve_held',
    'factor_default_interest_payable',
    'factor_fee_expense',
    'factor_reserve_default',
    'factor_reserve_held',
    'factor_transaction_fee',
    'factor_wire_fee',
    'factoring_advance_liability',
    'factoring_recoursed_ar',
    'fixed_asset_default',
    'fuel_advance_recovery',
    'fuel_card_payable_dreamline',
    'fuel_overage_receivable',
    'fuel_wallet_relay',
    'gain_loss_on_disposal',
    'heavy_repair_expense',
    'insurance_expense',
    'insurance_recovery',
    'intercompany_receivable_ih35_transportation',
    'interest_income',
    'interest_receivable',
    'lease_receivable',
    'lease_recovery',
    'maintenance_parts_expense',
    'operating_bank',
    'other_operating_expense',
    'other_recovery',
    'prepaid_asset_default',
    'property_tax_expense',
    'property_tax_payable',
    'reimbursement_expense',
    'related_party_interest_expense',
    'rent_expense',
    'rental_income',
    'retained_earnings',
    'revenue_default',
    'sales_tax_payable',
    'settlement_dispute_correction_recovery',
    'toll_scale_expense',
    'unbilled_revenue',
    'uncategorized_expense',
    'undeposited_funds',
    'warranty_recovery'
));

DO $bind$
DECLARE
  v_co uuid;
BEGIN
  SELECT id INTO v_co FROM org.companies WHERE code = 'USMCA';
  IF v_co IS NULL THEN RETURN; END IF;
  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT v_co, x.role, a.id, true
    FROM (VALUES ('driver_damage_receivable', '1255'), ('driver_fine_receivable', '1256'), ('driver_negative_settlement_receivable', '1257')) AS x(role, num)
    JOIN catalogs.accounts a ON a.operating_company_id = v_co AND a.account_number = x.num AND a.deactivated_at IS NULL
   WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r WHERE r.operating_company_id = v_co AND r.role = x.role AND r.is_active);
END
$bind$;
