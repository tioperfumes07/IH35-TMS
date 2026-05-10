BEGIN;

ALTER TABLE banking.transaction_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_categories_company_scope ON banking.transaction_categories;
CREATE POLICY transaction_categories_company_scope
  ON banking.transaction_categories
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

COMMIT;

