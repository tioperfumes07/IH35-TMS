-- Block M — driver location / POD columns, vendor compliance extensions, in-app notifications.
-- Note: repo already had 0172/0173; Block M DDL starts at 0174.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata' AND t.typname = 'load_status_enum' AND e.enumlabel = 'offered'
  ) THEN
    ALTER TYPE mdata.load_status_enum ADD VALUE 'offered';
  END IF;
END$$;

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS pickup_pod_photo_r2_key TEXT;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS pickup_pod_sig_r2_key TEXT;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS pickup_pod_at TIMESTAMPTZ;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS delivery_pod_photo_r2_key TEXT;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS delivery_pod_sig_r2_key TEXT;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS delivery_pod_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS mdata.driver_location_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_id UUID NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('status', 'location', 'pickup_pod', 'delivery_pod')),
  load_status TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  r2_photo_key TEXT,
  r2_signature_key TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_driver_location_events_load_recorded
  ON mdata.driver_location_events (load_id, recorded_at DESC);

ALTER TABLE mdata.driver_location_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_location_events_company_scope ON mdata.driver_location_events;
CREATE POLICY driver_location_events_company_scope
  ON mdata.driver_location_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.driver_location_events TO ih35_app;

CREATE TABLE IF NOT EXISTS mdata.vendor_extensions (
  vendor_id UUID PRIMARY KEY REFERENCES mdata.vendors(id) ON DELETE CASCADE,
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  coi_pdf_r2_key TEXT,
  coi_expires_on DATE,
  w9_pdf_r2_key TEXT,
  w9_tax_id_ciphertext TEXT,
  net_terms_days INTEGER,
  default_payment_method TEXT,
  coi_warn_last_sent_on DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS ix_vendor_extensions_company ON mdata.vendor_extensions (operating_company_id);
CREATE INDEX IF NOT EXISTS ix_vendor_extensions_coi_expiry ON mdata.vendor_extensions (coi_expires_on);

ALTER TABLE mdata.vendor_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_extensions_company_scope ON mdata.vendor_extensions;
CREATE POLICY vendor_extensions_company_scope
  ON mdata.vendor_extensions
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.vendor_extensions TO ih35_app;

CREATE TABLE IF NOT EXISTS identity.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_in_app_notifications_user_unread
  ON identity.in_app_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE identity.in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS in_app_notifications_user_scope ON identity.in_app_notifications;
CREATE POLICY in_app_notifications_user_scope
  ON identity.in_app_notifications
  FOR ALL TO ih35_app
  USING (
    user_id::text = current_setting('app.user_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    user_id::text = current_setting('app.user_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.in_app_notifications TO ih35_app;

COMMIT;
