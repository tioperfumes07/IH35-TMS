BEGIN;

CREATE TABLE IF NOT EXISTS mdata.customer_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id) ON DELETE CASCADE,
  lane_label text NOT NULL,
  origin_city text NOT NULL,
  origin_state text NOT NULL,
  destination_city text NOT NULL,
  destination_state text NOT NULL,
  typical_miles int,
  base_rate_cents bigint NOT NULL,
  fsc_per_mile_cents int,
  accessorials jsonb NOT NULL DEFAULT '[]',
  notes text,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_lanes_customer ON mdata.customer_lanes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_lanes_active ON mdata.customer_lanes(customer_id) WHERE deactivated_at IS NULL;

ALTER TABLE mdata.customer_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_lanes_company_scope ON mdata.customer_lanes;
CREATE POLICY customer_lanes_company_scope ON mdata.customer_lanes
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON mdata.customer_lanes TO ih35_app;

COMMIT;
