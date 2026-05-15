-- P7 Wave 2 v3 — sales tax agencies/returns + categorization rules (Phase 10 + Phase 15).

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.sales_tax_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  name text NOT NULL,
  jurisdiction text,
  agency_vendor_id uuid REFERENCES mdata.vendors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id)
);

CREATE TABLE IF NOT EXISTS accounting.sales_tax_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  agency_id uuid NOT NULL REFERENCES accounting.sales_tax_agencies(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  taxable_sales_cents bigint NOT NULL DEFAULT 0,
  non_taxable_sales_cents bigint NOT NULL DEFAULT 0,
  tax_collected_cents bigint NOT NULL DEFAULT 0,
  tax_owed_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filed', 'paid')),
  filed_at timestamptz,
  paid_bill_id uuid REFERENCES accounting.bills(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_sales_tax_returns_company_period
  ON accounting.sales_tax_returns (operating_company_id, period_end DESC);

ALTER TABLE accounting.sales_tax_agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.sales_tax_returns ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON accounting.sales_tax_agencies TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.sales_tax_returns TO ih35_app;

DROP POLICY IF EXISTS sales_tax_agencies_company_scope ON accounting.sales_tax_agencies;
CREATE POLICY sales_tax_agencies_company_scope ON accounting.sales_tax_agencies
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS sales_tax_returns_company_scope ON accounting.sales_tax_returns;
CREATE POLICY sales_tax_returns_company_scope ON accounting.sales_tax_returns
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

CREATE TABLE IF NOT EXISTS accounting.banking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  priority int NOT NULL DEFAULT 0,
  description_contains text,
  description_regex text,
  amount_min_cents bigint,
  amount_max_cents bigint,
  bank_account_filter_id uuid REFERENCES banking.bank_accounts(id),
  then_vendor_id uuid REFERENCES mdata.vendors(id),
  then_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  then_class_id uuid REFERENCES catalogs.classes(id),
  then_memo_template text,
  is_active boolean NOT NULL DEFAULT true,
  last_matched_at timestamptz,
  match_count int NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banking_rules_company_priority
  ON accounting.banking_rules (operating_company_id, priority DESC);

ALTER TABLE accounting.banking_rules ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.banking_rules TO ih35_app;

DROP POLICY IF EXISTS banking_rules_company_scope ON accounting.banking_rules;
CREATE POLICY banking_rules_company_scope ON accounting.banking_rules
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

COMMIT;
