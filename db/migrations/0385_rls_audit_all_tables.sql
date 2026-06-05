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

COMMIT;
