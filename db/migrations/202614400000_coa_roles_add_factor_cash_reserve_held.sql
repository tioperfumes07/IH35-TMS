-- 202614400000_coa_roles_add_factor_cash_reserve_held.sql
-- R-187 G4: widen accounting.chart_of_accounts_roles's role CHECK to admit
-- 'factor_cash_reserve_held' -- the new leg role for Faro's "Cash Rsv" component (own reserve pool
-- per owner ruling, GL 1235, never the escrow reserve/factor_reserve_held/GL 1230). Mirrors the
-- existing 'factor_reserve_held' and 'factor_wire_fee' roles exactly; same idempotent DROP+re-ADD
-- shape 202613350001_linkage_integrity_law_reconciliation_matches_widen.sql already used for a
-- CHECK-constraint widen. Additive only (existing values unchanged), no data change.

ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;

ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role = ANY (ARRAY[
    'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default','expense_default',
    'factor_reserve_default','escrow_liability_default','sales_tax_payable','cash_basis_adjustment_equity',
    'retained_earnings','uncategorized_expense','rental_income','lease_receivable','interest_income',
    'gain_loss_on_disposal','factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
    'default_interest_expense','factor_reserve_held','factor_fee_expense','property_tax_expense',
    'property_tax_payable','driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
    'advance_recovery','damage_recovery','lease_recovery','insurance_recovery','fuel_advance_recovery',
    'other_recovery','abandonment_chargeback_recovery','cash_dip','civil_fines_expense',
    'maintenance_parts_expense','warranty_recovery','fuel_overage_receivable','factor_wire_fee',
    'insurance_expense','unbilled_revenue','fixed_asset_default','accum_depr_default','depr_expense_default',
    'heavy_repair_expense','prepaid_asset_default','amortization_expense_default',
    'broker_customer_advance_liability','rent_expense','related_party_interest_expense','operating_bank',
    'settlement_dispute_correction_recovery','company_fuel_advance_expense','detention_pay_expense',
    'bank_fee_recovery','toll_scale_expense','other_operating_expense',
    'factor_cash_reserve_held'
  ]::text[]));
