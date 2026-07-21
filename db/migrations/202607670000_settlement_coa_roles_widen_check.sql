-- [HOLD-FOR-JORGE — TIER 1 · §1.4 FINANCIAL CLUSTER] Settlement / driver / fuel / period-close CoA roles
-- become first-class values of the PRIMARY designation table accounting.chart_of_accounts_roles.
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. This migration is DDL-ONLY (widens two closed-list CHECKs). It
--     seeds NO role→account mappings and creates NO accounts — designation is OWNER-entered via the
--     CoaRoles page (accounting.chart_of_accounts_roles) after PR #3102 mounts the routes. Apply ONLY on a
--     Neon branch by Jorge's hand after review, then ledger-backfill so prod db:migrate skips it. ***
--
-- ROOT CAUSE (proven): the settlement/driver/fuel/period-close posters resolve their role→GL-account
-- ONLY from catalogs.account_role_bindings (0 rows in prod), so posting fails closed with
-- ACCOUNT_ROLE_BINDING_MISSING. Those role keys were NOT permitted in the PRIMARY table's CHECK, so an
-- owner could not designate them there even after the CoaRoles page mounts. This migration makes the
-- primary table ABLE to hold them; the companion code change repoints every poster at the resolver
-- (primary chart_of_accounts_roles first, legacy account_role_bindings kept as a fallback tier — Rule 07).
--
-- NO SEED / NO GL MATH (per §1.4 + owner instruction): widening the enum is additive scaffolding only.
-- The exact account_id for each role is an OWNER decision (which GL account "Cost of Labor–Mexico Drivers",
-- driver-payroll clearing, reimbursement expense, and each {type}_recovery account maps to). Seeding
-- guessed UUIDs would violate the no-guess / CPA-grade rule, so this migration deliberately seeds nothing.
-- The PR body lists the exact roles Jorge must designate via the CoaRoles page.
--
-- SUPERSET / IDEMPOTENCY: §1 rebuilds accounting.chart_of_accounts_roles.role as a TRUE SUPERSET of
-- main's current values (0223 base 12 + FIN-22's 4 + CODER-34's 6 + Property-Tax's 2 = 24) PLUS the 9
-- settlement roles = 33. §2 does the same for the legacy catalogs.account_role_bindings.role_key CHECK,
-- keeping ALL existing legacy values (the settlement role_keys already existed there since CODER-34 —
-- driver_pay_expense/driver_payroll_clearing/reimbursement_expense/*_recovery — so §2 is effectively a
-- no-op re-assertion that preserves the superset; included for a single self-contained, order-independent
-- law). DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent (re-runnable) and composes in any apply
-- order with the held property-tax/factoring wideners because every list here is a superset of theirs.
--
-- FRESH-DB SAFE: pure DDL on tables that already exist by this point in the chain (chart_of_accounts_roles
-- from 0223; account_role_bindings from 0010/0011). No RAISE, no data dependency. On a fresh CI DB the two
-- CHECKs are simply rebuilt to the 33/superset value lists — no rows exist that could violate them.
--
-- NO NEW TABLE / NO NEW GRANT: both tables already GRANT to ih35_app (0223 / 0010). Additive only.

BEGIN;

-- ===========================================================================================
-- §1 — PRIMARY designation table: accounting.chart_of_accounts_roles.role — widen to a TRUE SUPERSET
--      (24 existing on main) + 9 settlement/driver/fuel/period-close roles. Never drops a value.
-- ===========================================================================================
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
    -- NEW — settlement / driver / fuel / period-close poster roles (this migration). These already
    -- exist as catalogs.account_role_bindings.role_key values (since CODER-34); this makes the PRIMARY
    -- table able to hold + designate them so posters resolve them without the empty legacy table.
    'driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
    'advance_recovery','damage_recovery','lease_recovery','insurance_recovery',
    'fuel_advance_recovery','other_recovery'
  ));

-- ===========================================================================================
-- §2 — LEGACY fallback table: catalogs.account_role_bindings.role_key — re-assert the full superset
--      (kept for the resolver's legacy fallback tier — Rule 07 never-delete). All settlement role_keys
--      already existed here since CODER-34; this preserves them and stays order-independent.
-- ===========================================================================================
ALTER TABLE catalogs.account_role_bindings DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
ALTER TABLE catalogs.account_role_bindings ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
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
    'property_tax_expense', 'property_tax_payable'
  ])
);

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply — expect the 9 new roles to be ACCEPTED):
--   -- constraint accepts the new roles (no rows required):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'chart_of_accounts_roles_role_check';
--   -- after OWNER designates via the CoaRoles page, expect one active row per designated role for TRANSP:
--   SET app.operating_company_id = '<TRANSP>';
--   SELECT r.role, a.account_number, a.account_name
--   FROM accounting.chart_of_accounts_roles r
--   JOIN catalogs.accounts a ON a.id = r.account_id
--   WHERE r.operating_company_id = (SELECT id FROM org.companies WHERE code='TRANSP')
--     AND r.role IN ('driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
--                    'advance_recovery','damage_recovery','lease_recovery','insurance_recovery',
--                    'fuel_advance_recovery','other_recovery')
--     AND r.is_active = true
--   ORDER BY r.role;
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   BEGIN;
--     -- re-narrow both CHECKs to the prior (24 / legacy) value lists ONLY if no active rows use the
--     -- 9 new roles; never drop a value that a live designation references.
--   COMMIT;
