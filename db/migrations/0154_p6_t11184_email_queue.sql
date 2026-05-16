-- P6-T11184 — Email provider queue + alerts (additive). RLS mirrors qbo.sync_alerts company scope + lucia bypass.

BEGIN;

CREATE SCHEMA IF NOT EXISTS email;

-- Self-heal: mirror GRANT USAGE ON SCHEMA sms TO ih35_app (0166_block_h_notification_queues.sql); without this, inserts/selects against email.* fail with "permission denied for schema email".
GRANT USAGE ON SCHEMA email TO ih35_app;

CREATE TABLE IF NOT EXISTS email.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  to_addresses TEXT[] NOT NULL,
  cc_addresses TEXT[],
  bcc_addresses TEXT[],
  subject TEXT NOT NULL,
  template_key TEXT NOT NULL,
  template_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  queued_by_user_id UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_email_queue_due
  ON email.email_queue(next_retry_at)
  WHERE status='queued' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_email_queue_status_company
  ON email.email_queue(operating_company_id, status);

CREATE TABLE IF NOT EXISTS email.email_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES email.email_queue(id),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','error','critical')),
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER,
  resolved_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email.email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email.email_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_queue_company_scope ON email.email_queue;
CREATE POLICY email_queue_company_scope
  ON email.email_queue
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS email_alerts_company_scope ON email.email_alerts;
CREATE POLICY email_alerts_company_scope
  ON email.email_alerts
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON email.email_queue TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON email.email_alerts TO ih35_app;

COMMIT;
