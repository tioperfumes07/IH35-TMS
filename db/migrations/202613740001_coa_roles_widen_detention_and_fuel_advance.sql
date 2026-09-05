-- CLAIM-RESERVE 202613740001 (merged #20409).
--
-- WHAT THIS MIGRATION DOES: widens accounting.chart_of_accounts_roles.role's CHECK constraint to
-- admit TWO role values:
--
-- 1. 'company_fuel_advance_expense' (NEW) — LOAD-COSTS-COMPLETE-VERTICAL spec 09-04-2026 §1.2, owner
--    ruling: "the fuel advance from us to the driver is a company expense... bind by role, never by
--    name." LoadDetailCostsTab.tsx currently picks the fuel-advance debit account by a `/fuel/i` NAME
--    regex, which can resolve to an ASSET receivable ("1250 Driver Fuel-Overage Receivable") instead
--    of the expense account. This role is the fail-closed replacement.
--
-- 2. 'detention_pay_expense' (PRE-EXISTING DRIFT, found live 2026-09-04 while investigating the fuel
--    role above) — already a first-class CoaRole in resolver.service.ts's COA_ROLE_VALUES union since
--    DWELL-01-D3 (2026-08-30), and already present in the frontend CoaRoles designation enum, but was
--    NEVER added to this live DB CHECK constraint. Designating it on the CoaRoles page today would
--    fail the INSERT with a constraint violation even though the TS type accepts it as a valid
--    CoaRole — the exact same class of gap ND-INV-01's 'broker_customer_advance_liability' role had
--    (see 202612811700's own header) before that one was reconciled. Closing both in one pass.
--
-- The list below is reproduced from 202612811700 (the most recent widen migration, itself queried
-- from the LIVE constraint on prod 2026-08-20 rather than retyped from TypeScript, per that
-- migration's own note) with the two new values appended. Every existing value is preserved and
-- exactly two are added (Rule 07 never-delete-only-add).
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, guarded by to_regclass so a fresh CI DB
-- before this table exists is a clean no-op (matches 202612811700's own guard shape).
-- FRESH-DB SAFE: pure DDL on a table that already exists by this point in the chain (0223). No RAISE,
-- no data dependency, no rows required to satisfy the new CHECK.
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
        'settlement_dispute_correction_recovery',
        -- NEW — LOAD-COSTS-COMPLETE-VERTICAL §1.2 + drift fix
        'company_fuel_advance_expense','detention_pay_expense'
      ));
  END IF;
END $$;
