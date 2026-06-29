-- FIN-18 — Settlement + deduction GL posting foundation (BUILD-AND-HOLD; posting flag OFF).
-- Extends the catalogs.account_role_bindings role registry with the settlement posting roles,
-- adds the carrier-configurable net-pay floor config, and seeds the money flag
-- SETTLEMENT_GL_POSTING_ENABLED (DEFAULT OFF). Idempotent + fresh-DB-safe.
--
-- Driver settlements live ONLY in TRANSP and never cross-post, so the GLOBAL (non-opco) role_key
-- registry catalogs.account_role_bindings is the correct home for these roles (one posting entity).
BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Additively extend the role_key CHECK with the settlement posting roles:
--   driver_pay_expense  -> Dr driver-pay (gross)
--   driver_payroll_clearing (ALREADY present) -> Cr net-pay CLEARING (B4 locked = clearing, not liability)
--   reimbursement_expense -> Dr reimbursements
--   <bucket>_recovery   -> Cr each deduction to its BUCKET's role-mapped recovery account
-- (superset of the existing list + the new roles; a CHECK swap is additive and safe).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE catalogs.account_role_bindings
  DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
ALTER TABLE catalogs.account_role_bindings
  ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
    role_key = ANY (ARRAY[
      -- existing
      'ar_clearing', 'ap_clearing', 'cash_dip', 'cash_payroll', 'cash_petty',
      'fuel_expense', 'maintenance_expense', 'driver_payroll_clearing',
      'factor_advances_receivable', 'factor_chargebacks_payable', 'undeposited_funds',
      -- FIN-18 settlement posting roles
      'driver_pay_expense', 'reimbursement_expense',
      'advance_recovery', 'damage_recovery', 'lease_recovery', 'insurance_recovery',
      'fuel_advance_recovery', 'other_recovery'
    ])
  );

-- ---------------------------------------------------------------------------------------------
-- Carrier-configurable settlement-posting settings: the ENTITY-DEFAULT net-pay FLOOR % (driver must
-- retain >= this fraction of GROSS; default 10%) + the default worker classification. Per-driver
-- overrides live in driver_finance.driver_pay_settings (migration 202606290011).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.settlement_posting_config (
  operating_company_id uuid PRIMARY KEY REFERENCES org.companies(id),
  net_pay_floor_pct numeric(5,4) NOT NULL DEFAULT 0.1000
    CHECK (net_pay_floor_pct >= 0 AND net_pay_floor_pct <= 1),
  default_worker_classification text NOT NULL DEFAULT '1099'
    CHECK (default_worker_classification IN ('1099', 'w2')),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  updated_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounting.settlement_posting_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.settlement_posting_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_posting_config_tenant_scope ON accounting.settlement_posting_config;
CREATE POLICY settlement_posting_config_tenant_scope ON accounting.settlement_posting_config
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);
GRANT SELECT, INSERT, UPDATE ON accounting.settlement_posting_config TO ih35_app;

-- ---------------------------------------------------------------------------------------------
-- Money flag — DEFAULT OFF. With it OFF the FIN-18 poster is a no-op (zero JEs / financial rows).
-- ---------------------------------------------------------------------------------------------
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'SETTLEMENT_GL_POSTING_ENABLED',
  'FIN-18: post locked driver settlements + BUCKETED deductions to the GL (accrual-primary; Dr driver-pay gross, Cr each deduction to its bucket recovery account, Cr net-pay CLEARING for net). DEFAULT OFF — owner-gated.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
