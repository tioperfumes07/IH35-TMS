BEGIN;

CREATE TABLE IF NOT EXISTS accounting.chart_of_accounts_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  role text NOT NULL CHECK (
    role IN (
      'ar_control',
      'ap_control',
      'cash_clearing',
      'undeposited_funds',
      'revenue_default',
      'expense_default',
      'factor_reserve_default',
      'escrow_liability_default',
      'sales_tax_payable',
      'cash_basis_adjustment_equity',
      'retained_earnings'
    )
  ),
  account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_roles_company_role_active
  ON accounting.chart_of_accounts_roles(operating_company_id, role)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_coa_roles_company
  ON accounting.chart_of_accounts_roles(operating_company_id, is_active, role);

CREATE INDEX IF NOT EXISTS idx_coa_roles_account
  ON accounting.chart_of_accounts_roles(account_id);

ALTER TABLE accounting.chart_of_accounts_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coa_roles_company_scope ON accounting.chart_of_accounts_roles;
CREATE POLICY coa_roles_company_scope ON accounting.chart_of_accounts_roles
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.chart_of_accounts_roles TO ih35_app;

COMMIT;
