BEGIN;

-- Block-21 foundation: deterministic expense category -> GL account mapping.
-- Note: canonical chart-of-accounts storage in this repo is catalogs.accounts.
CREATE TABLE IF NOT EXISTS accounting.expense_category_account_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  category_kind text NOT NULL CHECK (
    category_kind IN (
      'fuel',
      'maintenance',
      'driver_pay',
      'factoring_fee',
      'toll',
      'escrow',
      'insurance',
      'office',
      'other'
    )
  ),
  category_code text NOT NULL,
  account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  posting_side text NOT NULL CHECK (posting_side IN ('debit', 'credit')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_uuid uuid REFERENCES identity.users(id),
  updated_by_user_uuid uuid REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_category_account_map_active
  ON accounting.expense_category_account_map (operating_company_id, category_kind, category_code, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_expense_category_account_map_company_kind
  ON accounting.expense_category_account_map (operating_company_id, category_kind, category_code);

CREATE INDEX IF NOT EXISTS idx_expense_category_account_map_account
  ON accounting.expense_category_account_map (account_id);

ALTER TABLE accounting.expense_category_account_map ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON accounting.expense_category_account_map TO ih35_app;

DROP POLICY IF EXISTS expense_category_account_map_company_scope ON accounting.expense_category_account_map;
CREATE POLICY expense_category_account_map_company_scope ON accounting.expense_category_account_map
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_expense_category_account_map_updated_at ON accounting.expense_category_account_map;
CREATE TRIGGER trg_expense_category_account_map_updated_at
BEFORE UPDATE ON accounting.expense_category_account_map
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

-- Drift-capture signal for migration chain verification.
SELECT to_regclass('accounting.expense_category_account_map') AS expense_category_account_map_table;

COMMIT;
