-- GAP-43 — Q8 scheduled report subscriptions + delivery log
-- Role: ih35_app (adapted from spec app_user)

BEGIN;

CREATE TABLE IF NOT EXISTS reports.scheduled_subscriptions (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  report_slug TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly','monthly','quarterly')),
  day_of_week INTEGER,
  day_of_month INTEGER,
  time_of_day TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  recipient_emails TEXT[] NOT NULL,
  recipient_user_uuids UUID[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_scheduled_at TIMESTAMPTZ,
  delivery_format TEXT NOT NULL DEFAULT 'pdf'
    CHECK (delivery_format IN ('pdf','xlsx','html')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_scheduled_sub_company_slug UNIQUE (operating_company_id, report_slug)
);

CREATE TABLE IF NOT EXISTS reports.scheduled_delivery_log (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_uuid UUID NOT NULL REFERENCES reports.scheduled_subscriptions(uuid),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success','failed','bounced')),
  error_message TEXT,
  recipients TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_subs_next
  ON reports.scheduled_subscriptions (next_scheduled_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_subs_company_active
  ON reports.scheduled_subscriptions (operating_company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_delivery_log_sub
  ON reports.scheduled_delivery_log (subscription_uuid, sent_at DESC);

ALTER TABLE reports.scheduled_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports.scheduled_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_subs_tenant_scope ON reports.scheduled_subscriptions;
CREATE POLICY scheduled_subs_tenant_scope ON reports.scheduled_subscriptions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS scheduled_delivery_log_tenant_scope ON reports.scheduled_delivery_log;
CREATE POLICY scheduled_delivery_log_tenant_scope ON reports.scheduled_delivery_log
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR subscription_uuid IN (
      SELECT uuid FROM reports.scheduled_subscriptions
      WHERE operating_company_id = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR subscription_uuid IN (
      SELECT uuid FROM reports.scheduled_subscriptions
      WHERE operating_company_id = current_setting('app.operating_company_id', true)
    )
  );

GRANT SELECT, INSERT, UPDATE ON reports.scheduled_subscriptions TO ih35_app;
GRANT SELECT, INSERT ON reports.scheduled_delivery_log TO ih35_app;

INSERT INTO reports.scheduled_subscriptions (
  operating_company_id,
  report_slug,
  cadence,
  day_of_week,
  day_of_month,
  time_of_day,
  timezone,
  recipient_emails,
  delivery_format,
  next_scheduled_at
)
SELECT
  c.id::text,
  r.report_slug,
  r.cadence,
  r.day_of_week,
  r.day_of_month,
  r.time_of_day::time,
  'America/Chicago',
  r.recipient_emails,
  r.delivery_format,
  NULL
FROM org.companies c
CROSS JOIN (VALUES
  ('weekly-cash-position',            'weekly',    1, NULL::int, '07:00:00', ARRAY['tioperfumes07@gmail.com']::text[],                              'pdf'),
  ('weekly-driver-settlement-preview','weekly',   5, NULL::int, '08:00:00', ARRAY['tioperfumes07@gmail.com','tioperfumes07@gmail.com']::text[],  'pdf'),
  ('weekly-ar-aging-60',              'weekly',    1, NULL::int, '08:00:00', ARRAY['tioperfumes07@gmail.com']::text[],                              'pdf'),
  ('monthly-pnl',                     'monthly',  NULL::int, 1, '06:00:00', ARRAY['tioperfumes07@gmail.com','cpa@ih35dispatch.com']::text[],       'pdf'),
  ('quarterly-ifta-preview',          'quarterly',NULL::int, NULL::int, '07:00:00', ARRAY['tioperfumes07@gmail.com']::text[],                        'pdf'),
  ('daily-safety-alerts-digest',      'daily',    NULL::int, NULL::int, '05:00:00', ARRAY['tioperfumes07@gmail.com','tioperfumes07@gmail.com']::text[], 'html')
) AS r(report_slug, cadence, day_of_week, day_of_month, time_of_day, recipient_emails, delivery_format)
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, report_slug) DO NOTHING;

COMMIT;
