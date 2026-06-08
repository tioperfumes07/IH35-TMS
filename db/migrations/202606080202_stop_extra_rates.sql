-- GAP-31 WF-053: per-stop extra rates for multi-stop loads.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.stop_extra_rates (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  stop_uuid UUID NOT NULL REFERENCES mdata.load_stops(id) ON DELETE CASCADE,
  load_uuid UUID NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  rate_type TEXT NOT NULL CHECK (
    rate_type IN ('extra_stop_fee', 'lumper', 'detention', 'fuel_surcharge', 'accessorial', 'other')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invoice_line_uuid UUID REFERENCES accounting.invoice_lines(id),
  created_by_user_uuid UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stop_extra_rates_load_active
  ON dispatch.stop_extra_rates(load_uuid, is_active);
CREATE INDEX IF NOT EXISTS idx_stop_extra_rates_stop
  ON dispatch.stop_extra_rates(stop_uuid);

ALTER TABLE dispatch.stop_extra_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.stop_extra_rates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stop_extra_rates_tenant_isolation ON dispatch.stop_extra_rates;
CREATE POLICY stop_extra_rates_tenant_isolation ON dispatch.stop_extra_rates
  USING (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()));

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.stop_extra_rates TO ih35_app;

COMMIT;
