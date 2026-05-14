-- P6-T11193 Block P — Driver PWA hardening: push subscriptions + driver issue reports.
-- Additive only (Invariant #24). RLS company-scoped + lucia bypass.

BEGIN;

CREATE SCHEMA IF NOT EXISTS driver_pwa;

CREATE TABLE IF NOT EXISTS driver_pwa.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_push_subscriptions_endpoint
  ON driver_pwa.push_subscriptions(endpoint);

CREATE INDEX IF NOT EXISTS ix_push_subscriptions_driver
  ON driver_pwa.push_subscriptions(operating_company_id, driver_id);

ALTER TABLE driver_pwa.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_company_scope ON driver_pwa.push_subscriptions;
CREATE POLICY push_subscriptions_company_scope
  ON driver_pwa.push_subscriptions
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON driver_pwa.push_subscriptions TO ih35_app;

CREATE TABLE IF NOT EXISTS maintenance.driver_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  load_id UUID REFERENCES mdata.loads(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('damage','maintenance','accident','other')),
  description TEXT NOT NULL,
  photo_r2_paths TEXT[],
  voice_memo_r2_path TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','resolved','dismissed')),
  reviewed_by_user_id UUID REFERENCES identity.users(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_driver_reports_company_status
  ON maintenance.driver_reports(operating_company_id, status, reported_at DESC);

ALTER TABLE maintenance.driver_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_reports_company_scope ON maintenance.driver_reports;
CREATE POLICY driver_reports_company_scope
  ON maintenance.driver_reports
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.driver_reports TO ih35_app;

COMMIT;
