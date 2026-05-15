-- Block H — durable SMS/WhatsApp queue rows + explicit notification preference overrides (additive).

BEGIN;

CREATE TABLE IF NOT EXISTS identity.user_notification_preferences (
  user_uuid UUID PRIMARY KEY,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE identity.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_preferences_scope ON identity.user_notification_preferences;
CREATE POLICY user_notification_preferences_scope
  ON identity.user_notification_preferences
  FOR ALL TO ih35_app
  USING (
    user_uuid::text = current_setting('app.user_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    user_uuid::text = current_setting('app.user_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_notification_preferences TO ih35_app;

CREATE SCHEMA IF NOT EXISTS sms;

CREATE TABLE IF NOT EXISTS sms.queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  provider_status TEXT NOT NULL DEFAULT 'queued',
  provider_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sms_queue_company_created_at
  ON sms.queue (operating_company_id, created_at DESC);

ALTER TABLE sms.queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_queue_company_scope ON sms.queue;
CREATE POLICY sms_queue_company_scope
  ON sms.queue
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA sms TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms.queue TO ih35_app;

CREATE SCHEMA IF NOT EXISTS whatsapp;

CREATE TABLE IF NOT EXISTS whatsapp.queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  to_phone TEXT NOT NULL,
  template_name TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_status TEXT NOT NULL DEFAULT 'queued',
  provider_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_whatsapp_queue_company_created_at
  ON whatsapp.queue (operating_company_id, created_at DESC);

ALTER TABLE whatsapp.queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_queue_company_scope ON whatsapp.queue;
CREATE POLICY whatsapp_queue_company_scope
  ON whatsapp.queue
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA whatsapp TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp.queue TO ih35_app;

COMMIT;
