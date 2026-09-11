-- CLAIM-RESERVE 202614050000 (merged #21719).
--
-- WHAT THIS MIGRATION DOES: widens accounting.chart_of_accounts_roles.role's CHECK constraint to
-- admit 2 new role values: 'toll_scale_expense' and 'other_operating_expense'.
--
-- ROW 0 REIMBURSEMENT-PER-TYPE-GL (owner ruling, INBOX-CC-1 2026-09-10): driver reimbursements
-- (driver_finance.driver_reimbursements.reimbursement_type IN ('toll','fuel','scale','parking',
-- 'lumper','other')) were ALL debiting the SAME generic 'reimbursement_expense' role account
-- (live-verified: account DRIVERTRIPLU056412 "Driver Trip-Lumper Reimbursement") regardless of
-- their real type -- so a fuel or toll reimbursement posted as if it were a lumper charge. Owner
-- mapping: fuel -> 5000 Fuel & Diesel (reuses the EXISTING 'company_fuel_advance_expense' role,
-- already bound there -- no new role needed for fuel); toll/scale/parking -> 5300 Tolls & Scales
-- (NEW role, 'toll_scale_expense', this migration); lumper -> unchanged (stays on
-- 'reimbursement_expense'); other -> 6999 Other Operating Expense (NEW role,
-- 'other_operating_expense', this migration).
--
-- The list below is reproduced from 202613810000 (the most recent widen migration, re-queried
-- LIVE from the constraint on Neon tiny-field-89581227 2026-09-10, not retyped from memory) with
-- the two new values appended. Every existing value is preserved and exactly two are added
-- (Rule 07 never-delete-only-add).
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, guarded by to_regclass so a fresh CI DB
-- before this table exists is a clean no-op (matches 202613810000's own guard shape).
-- FRESH-DB SAFE: pure DDL on a table that already exists by this point in the chain. No RAISE, no
-- data dependency, no rows required to satisfy the new CHECK.
-- NO RLS/GRANT CHANGE: accounting.chart_of_accounts_roles already carries FORCED RLS + standard grants.

DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN
    ALTER TABLE accounting.chart_of_accounts_roles
      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
    ALTER TABLE accounting.chart_of_accounts_roles
      ADD CONSTRAINT chart_of_accounts_roles_role_check
      CHECK (role IN (
        'ar_control','ap_control','cash_clearing','undeposited_funds',
        'revenue_default','expense_default','factor_reserve_default','escrow_liability_default',
        'sales_tax_payable','cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
        'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
        'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar','default_interest_expense',
        'factor_reserve_held','factor_fee_expense','property_tax_expense','property_tax_payable',
        'driver_pay_expense','driver_payroll_clearing','reimbursement_expense','advance_recovery',
        'damage_recovery','lease_recovery','insurance_recovery','fuel_advance_recovery',
        'other_recovery','abandonment_chargeback_recovery','cash_dip','civil_fines_expense',
        'maintenance_parts_expense','warranty_recovery','fuel_overage_receivable','factor_wire_fee',
        'insurance_expense','unbilled_revenue','fixed_asset_default','accum_depr_default',
        'depr_expense_default','heavy_repair_expense','prepaid_asset_default','amortization_expense_default',
        'broker_customer_advance_liability','rent_expense','related_party_interest_expense','operating_bank',
        'settlement_dispute_correction_recovery','company_fuel_advance_expense','detention_pay_expense',
        'bank_fee_recovery',
        -- NEW -- ROW 0 REIMBURSEMENT-PER-TYPE-GL (owner ruling 2026-09-10)
        'toll_scale_expense', 'other_operating_expense'
      ));
  END IF;
END $$;
