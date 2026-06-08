BEGIN;

-- RLS for dispatch.border_crossing_events (introduced in 202606080111 without RLS).
ALTER TABLE dispatch.border_crossing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.border_crossing_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS border_crossing_events_tenant_isolation ON dispatch.border_crossing_events;
CREATE POLICY border_crossing_events_tenant_isolation
  ON dispatch.border_crossing_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON dispatch.border_crossing_events TO ih35_app;

COMMIT;
