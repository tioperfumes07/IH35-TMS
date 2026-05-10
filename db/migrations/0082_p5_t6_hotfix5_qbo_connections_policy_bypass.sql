BEGIN;

DROP POLICY IF EXISTS qbo_connections_company_scope ON integrations.qbo_connections;
CREATE POLICY qbo_connections_company_scope
  ON integrations.qbo_connections
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

