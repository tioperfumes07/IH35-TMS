BEGIN;

CREATE SCHEMA IF NOT EXISTS banking;

CREATE TABLE IF NOT EXISTS banking.transaction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  plaid_category_pattern text NOT NULL,
  coa_account_id uuid,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('catalogs.accounts') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_categories_coa_account_id_fkey'
  ) THEN
    ALTER TABLE banking.transaction_categories
      ADD CONSTRAINT transaction_categories_coa_account_id_fkey
      FOREIGN KEY (coa_account_id) REFERENCES catalogs.accounts(id);
  ELSIF to_regclass('accounting.accounts') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_categories_coa_account_id_fkey'
  ) THEN
    ALTER TABLE banking.transaction_categories
      ADD CONSTRAINT transaction_categories_coa_account_id_fkey
      FOREIGN KEY (coa_account_id) REFERENCES accounting.accounts(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_transaction_categories_company_priority
  ON banking.transaction_categories (operating_company_id, priority);

ALTER TABLE banking.transaction_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_categories_company_scope ON banking.transaction_categories;
CREATE POLICY transaction_categories_company_scope
  ON banking.transaction_categories
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON banking.transaction_categories TO ih35_app;

COMMIT;
