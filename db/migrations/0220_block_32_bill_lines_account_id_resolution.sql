BEGIN;

ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS category_kind text,
  ADD COLUMN IF NOT EXISTS category_code text,
  ADD COLUMN IF NOT EXISTS account_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bill_lines_account_id_fkey'
  ) THEN
    ALTER TABLE accounting.bill_lines
      ADD CONSTRAINT bill_lines_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES catalogs.accounts(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_bill_lines_account_id
  ON accounting.bill_lines (account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_lines_category_kind_code
  ON accounting.bill_lines (category_kind, category_code);

GRANT SELECT, INSERT, UPDATE ON accounting.bill_lines TO ih35_app;

COMMIT;
