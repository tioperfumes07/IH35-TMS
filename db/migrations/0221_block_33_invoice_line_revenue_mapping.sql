BEGIN;

ALTER TABLE accounting.expense_category_account_map
  DROP CONSTRAINT IF EXISTS expense_category_account_map_category_kind_check;

ALTER TABLE accounting.expense_category_account_map
  ADD CONSTRAINT expense_category_account_map_category_kind_check
  CHECK (
    category_kind IN (
      'fuel',
      'maintenance',
      'revenue',
      'driver_pay',
      'factoring_fee',
      'toll',
      'escrow',
      'insurance',
      'office',
      'other'
    )
  );

ALTER TABLE accounting.invoice_lines
  ADD COLUMN IF NOT EXISTS revenue_code text,
  ADD COLUMN IF NOT EXISTS account_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_lines_account_id_fkey'
  ) THEN
    ALTER TABLE accounting.invoice_lines
      ADD CONSTRAINT invoice_lines_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES catalogs.accounts(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_account_id
  ON accounting.invoice_lines (account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_revenue_code
  ON accounting.invoice_lines (operating_company_id, revenue_code);

GRANT SELECT, INSERT, UPDATE ON accounting.invoice_lines TO ih35_app;

COMMIT;
