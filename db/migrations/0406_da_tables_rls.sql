-- FIX-DA-TABLES-RLS: Close RLS gap on safety.da_* tables created in migration 0327 (GAP-81).
-- verify:rls-operating-company-scope requires RLS + tenant policies on all operating_company_id tables.

BEGIN;

-- safety.da_program_enrollments
ALTER TABLE safety.da_program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.da_program_enrollments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS da_program_enrollments_tenant_scope ON safety.da_program_enrollments;
CREATE POLICY da_program_enrollments_tenant_scope
  ON safety.da_program_enrollments
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

-- safety.da_test_records
ALTER TABLE safety.da_test_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.da_test_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS da_test_records_tenant_scope ON safety.da_test_records;
CREATE POLICY da_test_records_tenant_scope
  ON safety.da_test_records
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

-- safety.da_random_pool_draws
ALTER TABLE safety.da_random_pool_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.da_random_pool_draws FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS da_random_pool_draws_tenant_scope ON safety.da_random_pool_draws;
CREATE POLICY da_random_pool_draws_tenant_scope
  ON safety.da_random_pool_draws
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

-- DOWN (manual rollback):
-- DROP POLICY IF EXISTS da_program_enrollments_tenant_scope ON safety.da_program_enrollments;
-- DROP POLICY IF EXISTS da_test_records_tenant_scope ON safety.da_test_records;
-- DROP POLICY IF EXISTS da_random_pool_draws_tenant_scope ON safety.da_random_pool_draws;
