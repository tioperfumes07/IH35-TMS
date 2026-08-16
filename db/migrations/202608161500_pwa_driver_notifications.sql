-- LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED — create pwa.driver_notifications.
-- Table was absent on prod → cash-advance / transfer / legal notify paths bare-returned.
-- Idempotent. FORCE RLS. Entity-scoped.

CREATE SCHEMA IF NOT EXISTS pwa;

CREATE TABLE IF NOT EXISTS pwa.driver_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwa_driver_notifications_driver_created
  ON pwa.driver_notifications (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pwa_driver_notifications_opco_unread
  ON pwa.driver_notifications (operating_company_id, driver_id)
  WHERE read_at IS NULL;

ALTER TABLE pwa.driver_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pwa.driver_notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pwa_driver_notifications_isolation ON pwa.driver_notifications;
CREATE POLICY pwa_driver_notifications_isolation ON pwa.driver_notifications
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT USAGE ON SCHEMA pwa TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON pwa.driver_notifications TO ih35_app;
REVOKE DELETE ON pwa.driver_notifications FROM PUBLIC;
REVOKE DELETE ON pwa.driver_notifications FROM ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pwa GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;
