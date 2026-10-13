-- 443.91 #4 (CC-3, batch 3): accounting.cash_flow_row_adjustments was the one accounting table whose company-isolation
-- policy had no lucia bypass branch (catalogs-rls-bypass-branch.db.test.ts ratchet: accounting must have ZERO such tables),
-- so every audit read under app.bypass_rls = 'lucia' saw a FALSE 0. The policy gains the house bypass branch, exactly the
-- shape of every other remediated table (e.g. 202615380700). Tenant isolation for the app role is unchanged.
SET LOCAL lock_timeout = '60s';

DROP POLICY IF EXISTS cash_flow_row_adjustments_company_isolation ON accounting.cash_flow_row_adjustments;
CREATE POLICY cash_flow_row_adjustments_company_isolation
  ON accounting.cash_flow_row_adjustments
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
