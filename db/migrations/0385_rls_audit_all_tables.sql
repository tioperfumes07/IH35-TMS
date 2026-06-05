-- USMCA-1: Close RLS gaps on carrier-scoped tables discovered during multi-carrier isolation audit.
BEGIN;

GRANT USAGE ON SCHEMA qbo_sync TO ih35_app;
GRANT USAGE ON SCHEMA integrations TO ih35_app;

-- qbo_sync.drift_log (0379) — operating_company_id without tenant RLS
ALTER TABLE qbo_sync.drift_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_sync.drift_log FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON qbo_sync.drift_log TO ih35_app;

DROP POLICY IF EXISTS drift_log_tenant_scope ON qbo_sync.drift_log;
CREATE POLICY drift_log_tenant_scope ON qbo_sync.drift_log
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- qbo_sync.drift_alert_throttle (0379)
ALTER TABLE qbo_sync.drift_alert_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_sync.drift_alert_throttle FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON qbo_sync.drift_alert_throttle TO ih35_app;

DROP POLICY IF EXISTS drift_alert_throttle_tenant_scope ON qbo_sync.drift_alert_throttle;
CREATE POLICY drift_alert_throttle_tenant_scope ON qbo_sync.drift_alert_throttle
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- integrations.qbo_payroll_links (0371)
ALTER TABLE integrations.qbo_payroll_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.qbo_payroll_links FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON integrations.qbo_payroll_links TO ih35_app;

DROP POLICY IF EXISTS qbo_payroll_links_tenant_scope ON integrations.qbo_payroll_links;
CREATE POLICY qbo_payroll_links_tenant_scope ON integrations.qbo_payroll_links
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- Dynamic sweep: any remaining carrier-scoped table missing RLS gets a standard tenant policy.
DO $$
DECLARE
  rec RECORD;
  pol_name text;
  policy_count int;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'operating_company_id' AND NOT a.attisdropped
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    SELECT count(*)::int INTO policy_count
    FROM pg_policy p
    WHERE p.polrelid = rec.oid;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rec.oid) THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
    END IF;

    IF policy_count = 0 THEN
      pol_name := left(rec.table_name || '_tenant_scope_usmca1', 63);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol_name, rec.schema_name, rec.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO ih35_app
         USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting(''app.operating_company_id'', true), '''')::uuid)
         WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting(''app.operating_company_id'', true), '''')::uuid)',
        pol_name, rec.schema_name, rec.table_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
