-- [HOLD-FOR-JORGE — TIER 1 · §1.4 FINANCIAL CLUSTER] Pay-run close residual role
-- 'abandonment_chargeback_recovery' becomes a first-class PRIMARY value of
-- accounting.chart_of_accounts_roles (companion to 202607670000 which left this role
-- legacy-only because settlement-payrun-close.service.ts was out of that PR's scope).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. This migration is DDL-ONLY (widens one closed-list CHECK).
--     It seeds NO role→account mappings and creates NO accounts — designation is OWNER-entered
--     via the CoaRoles page. Apply ONLY on a Neon branch by Jorge's hand after review, then
--     ledger-backfill so prod db:migrate skips it. ***
--
-- ROOT CAUSE: after #3109, pay-run close still resolved roles from catalogs.account_role_bindings
-- (empty in prod) while sibling posters used accounting.chart_of_accounts_roles. Closing that
-- gap requires this role in the PRIMARY CHECK so the owner can designate it and the shared
-- CoA-roles resolver can resolve it (primary first, legacy fallback — Rule 07).
--
-- SUPERSET / IDEMPOTENCY: rebuilds accounting.chart_of_accounts_roles.role as a TRUE SUPERSET of
-- 202607670000's 33 values PLUS abandonment_chargeback_recovery = 34. Never drops a value.
-- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent.
--
-- NO NEW TABLE / NO NEW GRANT / NO LEGACY CHECK CHANGE: legacy account_role_bindings already
-- permits abandonment_chargeback_recovery (202607670000 §2 / 202607380000). Additive only.

BEGIN;

ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role IN (
    -- 0223 base 12 (preserve ALL)
    'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
    'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
    'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
    -- FIN-22 lessor lease (ASC 842)
    'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
    -- CODER-34 factoring secured-borrowing
    'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
    'default_interest_expense','factor_reserve_held','factor_fee_expense',
    -- Business-Property Allocation
    'property_tax_expense','property_tax_payable',
    -- 202607670000 settlement / driver / fuel / period-close roles
    'driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
    'advance_recovery','damage_recovery','lease_recovery','insurance_recovery',
    'fuel_advance_recovery','other_recovery',
    -- NEW — pay-run close abandonment chargeback recovery (this migration)
    'abandonment_chargeback_recovery'
  ));

COMMIT;

-- POST-DEPLOY VERIFICATION (Neon, after apply):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chart_of_accounts_roles_role_check';
--   -- expect 'abandonment_chargeback_recovery' present; no rows required.
