-- [HOLD-FOR-JORGE — TIER 1 · §1.4 FINANCIAL CLUSTER] Promote cash_dip to the PRIMARY CoA role registry
-- accounting.chart_of_accounts_roles (lane defect A / WO 2026-07-23).
--
-- *** DO NOT MERGE TO APPLY ON PROD VIA db:migrate. DO NOT RUN ON PROD FROM CI. This migration is
--     DDL-ONLY (widens one closed-list CHECK). It seeds NO role→account mappings and creates NO
--     accounts — designation is OWNER-entered via the CoaRoles page after apply:
--       cash_dip → WF - General Operating 6103 (QBO-1150040141) for TRANSP (CPA/owner locked).
--     Apply ONLY on a Neon branch by Jorge's hand after review, then ledger-backfill so prod
--     db:migrate skips it. ***
--
-- ROOT CAUSE (prod-verified): settlement BillPayment DIP cash resolution JOINs
-- catalogs.account_role_bindings (0 rows) for role_key='cash_dip'. The PRIMARY table's CHECK (34
-- values after 202607710000) does NOT permit 'cash_dip', so the owner cannot designate the DIP
-- operating cash account there. cash_dip already exists on the LEGACY bindings CHECK (0010 /
-- 202607670000 §2) — this migration makes the PRIMARY table able to hold it.
--
-- SUPERSET / IDEMPOTENCY: rebuilds accounting.chart_of_accounts_roles.role as a TRUE SUPERSET of
-- 202607710000's 34 values PLUS 'cash_dip' = 35. Never drops a value.
-- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent.
--
-- NO NEW TABLE / NO NEW GRANT / NO LEGACY CHECK CHANGE: legacy account_role_bindings already
-- permits cash_dip. Additive only. Companion code rewires resolveDipBankAccountId to
-- resolveRoleAccountOptional(..., "cash_dip") then banking.bank_accounts by ledger_account_id.

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
    -- 202607710000 pay-run abandonment chargeback recovery
    'abandonment_chargeback_recovery',
    -- NEW — DIP operating cash (this migration); CPA lock = WF General Operating 6103
    'cash_dip'
  ));

COMMIT;

-- POST-DEPLOY VERIFICATION (Neon, after apply):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chart_of_accounts_roles_role_check';
--   -- expect 'cash_dip' present among 35 values; no rows required until owner designates.
--   -- Owner designate (TRANSP): cash_dip → catalogs.accounts QBO-1150040141 (WF - General Operating 6103).
