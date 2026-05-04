BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;
GRANT USAGE ON SCHEMA catalogs TO ih35_app;

CREATE TABLE IF NOT EXISTS catalogs.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (
    account_type IN (
      'Asset',
      'Liability',
      'Equity',
      'Income',
      'Expense',
      'CostOfGoodsSold',
      'OtherIncome',
      'OtherExpense'
    )
  ),
  account_subtype text,
  parent_account_id uuid REFERENCES catalogs.accounts(id),
  qbo_account_id text UNIQUE,
  qbo_account_qrn text,
  is_postable boolean NOT NULL DEFAULT true,
  currency_code text NOT NULL DEFAULT 'USD',
  opening_balance_cents bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_accounts_account_number
  ON catalogs.accounts (account_number);
CREATE INDEX IF NOT EXISTS idx_catalogs_accounts_account_type
  ON catalogs.accounts (account_type);
CREATE INDEX IF NOT EXISTS idx_catalogs_accounts_parent_account_id
  ON catalogs.accounts (parent_account_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_accounts_qbo_account_id
  ON catalogs.accounts (qbo_account_id);

CREATE TABLE IF NOT EXISTS catalogs.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name text NOT NULL UNIQUE,
  class_code text UNIQUE,
  parent_class_id uuid REFERENCES catalogs.classes(id),
  qbo_class_id text UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_classes_class_name
  ON catalogs.classes (class_name);
CREATE INDEX IF NOT EXISTS idx_catalogs_classes_parent_class_id
  ON catalogs.classes (parent_class_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_classes_qbo_class_id
  ON catalogs.classes (qbo_class_id);

CREATE TABLE IF NOT EXISTS catalogs.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL UNIQUE,
  item_code text UNIQUE,
  item_type text NOT NULL CHECK (
    item_type IN ('Service', 'Inventory', 'NonInventory', 'Bundle', 'Discount', 'Charge')
  ),
  description text,
  unit_price_cents bigint,
  default_income_account_id uuid REFERENCES catalogs.accounts(id),
  default_expense_account_id uuid REFERENCES catalogs.accounts(id),
  default_class_id uuid REFERENCES catalogs.classes(id),
  qbo_item_id text UNIQUE,
  taxable boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_items_item_name
  ON catalogs.items (item_name);
CREATE INDEX IF NOT EXISTS idx_catalogs_items_item_type
  ON catalogs.items (item_type);
CREATE INDEX IF NOT EXISTS idx_catalogs_items_qbo_item_id
  ON catalogs.items (qbo_item_id);

CREATE TABLE IF NOT EXISTS catalogs.payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terms_name text NOT NULL UNIQUE,
  days_until_due int NOT NULL CHECK (days_until_due >= 0),
  early_payment_discount_pct numeric(5,2),
  early_payment_discount_days int,
  qbo_terms_id text UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_payment_terms_terms_name
  ON catalogs.payment_terms (terms_name);
CREATE INDEX IF NOT EXISTS idx_catalogs_payment_terms_qbo_terms_id
  ON catalogs.payment_terms (qbo_terms_id);

CREATE TABLE IF NOT EXISTS catalogs.posting_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  template_code text NOT NULL UNIQUE,
  description text,
  debit_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  credit_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  default_class_id uuid REFERENCES catalogs.classes(id),
  default_memo text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_posting_templates_template_name
  ON catalogs.posting_templates (template_name);
CREATE INDEX IF NOT EXISTS idx_catalogs_posting_templates_template_code
  ON catalogs.posting_templates (template_code);
CREATE INDEX IF NOT EXISTS idx_catalogs_posting_templates_debit_account_id
  ON catalogs.posting_templates (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_posting_templates_credit_account_id
  ON catalogs.posting_templates (credit_account_id);

CREATE TABLE IF NOT EXISTS catalogs.account_role_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE CHECK (
    role_key IN (
      'ar_clearing',
      'ap_clearing',
      'cash_dip',
      'cash_payroll',
      'cash_petty',
      'fuel_expense',
      'maintenance_expense',
      'driver_payroll_clearing',
      'factor_advances_receivable',
      'factor_chargebacks_payable',
      'undeposited_funds'
    )
  ),
  account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_account_role_bindings_role_key
  ON catalogs.account_role_bindings (role_key);
CREATE INDEX IF NOT EXISTS idx_catalogs_account_role_bindings_account_id
  ON catalogs.account_role_bindings (account_id);

ALTER TABLE catalogs.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.classes FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.items FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.payment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.payment_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.posting_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.posting_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.account_role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.account_role_bindings FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON catalogs.accounts TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.classes TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.items TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.payment_terms TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.posting_templates TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.account_role_bindings TO ih35_app;

DROP POLICY IF EXISTS accounts_select ON catalogs.accounts;
CREATE POLICY accounts_select
ON catalogs.accounts
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS accounts_insert ON catalogs.accounts;
CREATE POLICY accounts_insert
ON catalogs.accounts
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS accounts_update ON catalogs.accounts;
CREATE POLICY accounts_update
ON catalogs.accounts
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS classes_select ON catalogs.classes;
CREATE POLICY classes_select
ON catalogs.classes
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS classes_insert ON catalogs.classes;
CREATE POLICY classes_insert
ON catalogs.classes
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS classes_update ON catalogs.classes;
CREATE POLICY classes_update
ON catalogs.classes
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS items_select ON catalogs.items;
CREATE POLICY items_select
ON catalogs.items
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS items_insert ON catalogs.items;
CREATE POLICY items_insert
ON catalogs.items
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS items_update ON catalogs.items;
CREATE POLICY items_update
ON catalogs.items
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS payment_terms_select ON catalogs.payment_terms;
CREATE POLICY payment_terms_select
ON catalogs.payment_terms
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS payment_terms_insert ON catalogs.payment_terms;
CREATE POLICY payment_terms_insert
ON catalogs.payment_terms
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS payment_terms_update ON catalogs.payment_terms;
CREATE POLICY payment_terms_update
ON catalogs.payment_terms
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS posting_templates_select ON catalogs.posting_templates;
CREATE POLICY posting_templates_select
ON catalogs.posting_templates
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS posting_templates_insert ON catalogs.posting_templates;
CREATE POLICY posting_templates_insert
ON catalogs.posting_templates
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS posting_templates_update ON catalogs.posting_templates;
CREATE POLICY posting_templates_update
ON catalogs.posting_templates
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS account_role_bindings_select ON catalogs.account_role_bindings;
CREATE POLICY account_role_bindings_select
ON catalogs.account_role_bindings
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS account_role_bindings_insert ON catalogs.account_role_bindings;
CREATE POLICY account_role_bindings_insert
ON catalogs.account_role_bindings
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP POLICY IF EXISTS account_role_bindings_update ON catalogs.account_role_bindings;
CREATE POLICY account_role_bindings_update
ON catalogs.account_role_bindings
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
);

DROP TRIGGER IF EXISTS trg_catalogs_accounts_updated_at ON catalogs.accounts;
CREATE TRIGGER trg_catalogs_accounts_updated_at
BEFORE UPDATE ON catalogs.accounts
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_catalogs_classes_updated_at ON catalogs.classes;
CREATE TRIGGER trg_catalogs_classes_updated_at
BEFORE UPDATE ON catalogs.classes
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_catalogs_items_updated_at ON catalogs.items;
CREATE TRIGGER trg_catalogs_items_updated_at
BEFORE UPDATE ON catalogs.items
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_catalogs_payment_terms_updated_at ON catalogs.payment_terms;
CREATE TRIGGER trg_catalogs_payment_terms_updated_at
BEFORE UPDATE ON catalogs.payment_terms
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_catalogs_posting_templates_updated_at ON catalogs.posting_templates;
CREATE TRIGGER trg_catalogs_posting_templates_updated_at
BEFORE UPDATE ON catalogs.posting_templates
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_catalogs_account_role_bindings_updated_at ON catalogs.account_role_bindings;
CREATE TRIGGER trg_catalogs_account_role_bindings_updated_at
BEFORE UPDATE ON catalogs.account_role_bindings
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_payment_terms_fk'
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT customers_payment_terms_fk
      FOREIGN KEY (payment_terms_id)
      REFERENCES catalogs.payment_terms(id);
  END IF;
END
$$;

COMMIT;
