-- B21-D9: Customer ETA notify — per-customer preferences + delivery log.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.customer_notify_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id) ON DELETE CASCADE,
  opt_in boolean NOT NULL DEFAULT false,
  notify_sms boolean NOT NULL DEFAULT false,
  notify_email boolean NOT NULL DEFAULT true,
  notify_on_departed boolean NOT NULL DEFAULT true,
  notify_on_arrived boolean NOT NULL DEFAULT true,
  notify_on_near_arrival boolean NOT NULL DEFAULT true,
  notify_on_delayed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_notify_preferences_customer_unique UNIQUE (operating_company_id, customer_id)
);

CREATE TABLE IF NOT EXISTS dispatch.notify_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  stop_id uuid NULL REFERENCES mdata.load_stops(id) ON DELETE SET NULL,
  milestone_type text NOT NULL CHECK (milestone_type IN ('departed', 'arrived', 'near_arrival', 'delayed')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient text NOT NULL,
  template_key text NOT NULL,
  subject text NULL,
  provider_id text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notify_log_company_created
  ON dispatch.notify_log (operating_company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notify_log_load
  ON dispatch.notify_log (load_id, milestone_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_log_dedupe
  ON dispatch.notify_log (operating_company_id, load_id, milestone_type, channel, COALESCE(stop_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('sent', 'pending');

ALTER TABLE dispatch.customer_notify_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.notify_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_notify_preferences_company_scope ON dispatch.customer_notify_preferences;
CREATE POLICY customer_notify_preferences_company_scope
  ON dispatch.customer_notify_preferences
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS notify_log_company_scope ON dispatch.notify_log;
CREATE POLICY notify_log_company_scope
  ON dispatch.notify_log
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON dispatch.customer_notify_preferences TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.notify_log TO ih35_app;

COMMIT;
