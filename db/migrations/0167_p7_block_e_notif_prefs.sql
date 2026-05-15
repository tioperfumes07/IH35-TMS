-- P7 Block E — additive prefs columns + onboarding (runs after Block H 0166 notification queues).
-- Safe if identity.user_notification_preferences already exists (Block H: user_uuid PK + boolean flags).
-- Standing Order #18: idempotent guards, PUBLIC grants supplemental to Block H, no audit triggers.

BEGIN;

CREATE SCHEMA IF NOT EXISTS identity;

GRANT USAGE ON SCHEMA identity TO PUBLIC;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL;

-- If Block H did not run: create H-shaped table so ALTERs below apply uniformly.
CREATE TABLE IF NOT EXISTS identity.user_notification_preferences (
  user_uuid UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE identity.user_notification_preferences
  ADD COLUMN IF NOT EXISTS channels jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE identity.user_notification_preferences
  ADD COLUMN IF NOT EXISTS event_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE identity.user_notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start time NULL;

ALTER TABLE identity.user_notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_end time NULL;

ALTER TABLE identity.user_notification_preferences
  ADD COLUMN IF NOT EXISTS timezone text NULL;

CREATE INDEX IF NOT EXISTS ix_user_notification_preferences_updated_at
  ON identity.user_notification_preferences (updated_at DESC);

ALTER TABLE identity.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_preferences_open ON identity.user_notification_preferences;

CREATE POLICY user_notification_preferences_open
  ON identity.user_notification_preferences
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_notification_preferences TO PUBLIC;

COMMIT;
