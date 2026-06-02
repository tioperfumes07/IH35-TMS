-- Block 17: Notification Center — in-app user notifications + preferences
BEGIN;

CREATE SCHEMA IF NOT EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'compliance_expiring','compliance_expired','maintenance_alert',
    'load_status','driver_alert','system','message'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  title TEXT NOT NULL,
  body TEXT,
  action_link TEXT,
  entity_type TEXT,
  entity_id UUID,
  source_block TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notif_user ON notifications.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notif_unread ON notifications.user_notifications(user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_notif_created ON notifications.user_notifications(created_at DESC);

ALTER TABLE notifications.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notif_isolation ON notifications.user_notifications;
CREATE POLICY user_notif_isolation ON notifications.user_notifications
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR user_id = current_setting('app.current_user_id', true)::uuid
  );

CREATE TABLE IF NOT EXISTS notifications.user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  channels_per_type JSONB NOT NULL DEFAULT '{"compliance":["in_app","email"],"maintenance":["in_app"],"load":["in_app"]}'::jsonb,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  email_digest_enabled BOOLEAN DEFAULT FALSE,
  email_digest_frequency TEXT CHECK (email_digest_frequency IN ('daily','weekly') OR email_digest_frequency IS NULL),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notif_prefs_isolation ON notifications.user_notification_preferences;
CREATE POLICY user_notif_prefs_isolation ON notifications.user_notification_preferences
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR user_id = current_setting('app.current_user_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON notifications.user_notifications TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON notifications.user_notification_preferences TO ih35_app;

COMMIT;
