-- GAP-26 RLS addendum: add tenant isolation to dispatch.border_crossing_events.
-- This migration was omitted from 202606080111_border_crossing_events.sql.
-- Caught by verify:rls-migration-scan (GAP-PREMERGE-GATES-EXPAND).
BEGIN;

ALTER TABLE dispatch.border_crossing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.border_crossing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY border_crossing_events_tenant_isolation ON dispatch.border_crossing_events
  USING (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()));

COMMIT;
