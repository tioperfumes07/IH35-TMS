-- Block 21: Border Crossing Wizard — wizard fields, ports of entry, CBP wait times cache
BEGIN;

-- Extend vendor_category to include customs_broker for broker selector
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_vendor_category_chk') THEN
    ALTER TABLE mdata.vendors DROP CONSTRAINT vendors_vendor_category_chk;
    ALTER TABLE mdata.vendors
      ADD CONSTRAINT vendors_vendor_category_chk
      CHECK (
        vendor_category IS NULL OR vendor_category IN (
          'diesel','def','repairs_maintenance','road_service','meals_entertainment','driver',
          'washout','lumpers','insurance','tolls','parking','permits','taxes',
          'professional_services','utilities','rent','office_supplies','software',
          'customs_broker','other'
        )
      );
  END IF;
END $$;

ALTER TABLE mdata.unit_border_crossings
  ADD COLUMN IF NOT EXISTS planned_crossing_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commodity TEXT,
  ADD COLUMN IF NOT EXISTS commodity_value_cents BIGINT,
  ADD COLUMN IF NOT EXISTS cargo_weight_lbs INTEGER,
  ADD COLUMN IF NOT EXISTS customs_broker_id UUID REFERENCES mdata.vendors(id),
  ADD COLUMN IF NOT EXISTS customs_broker_status TEXT
    CHECK (customs_broker_status IN ('docs_pending','docs_submitted','cleared','discrepancy','released') OR customs_broker_status IS NULL),
  ADD COLUMN IF NOT EXISTS emanifest_status TEXT
    CHECK (emanifest_status IN ('not_required','draft','submitted','accepted','rejected') OR emanifest_status IS NULL),
  ADD COLUMN IF NOT EXISTS emanifest_reference TEXT,
  ADD COLUMN IF NOT EXISTS driver_fast_card_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hazmat_declared BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bond_number TEXT,
  ADD COLUMN IF NOT EXISTS wizard_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wizard_completed_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS port_of_entry_id UUID;

CREATE SCHEMA IF NOT EXISTS reference;

CREATE TABLE IF NOT EXISTS reference.ports_of_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  country TEXT NOT NULL CHECK (country IN ('US','MX')),
  state_or_province TEXT,
  city TEXT,
  border_country TEXT NOT NULL,
  cbp_port_code TEXT,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  UNIQUE (name, country)
);

INSERT INTO reference.ports_of_entry (name, short_name, country, state_or_province, city, border_country, cbp_port_code)
VALUES
  ('Laredo World Trade Bridge', 'Laredo WTB', 'US', 'TX', 'Laredo', 'MX', '2304'),
  ('Laredo Colombia Solidarity Bridge', 'Laredo Solidarity', 'US', 'TX', 'Laredo', 'MX', '2304'),
  ('Eagle Pass', 'Eagle Pass', 'US', 'TX', 'Eagle Pass', 'MX', '2303'),
  ('Pharr International Bridge', 'Pharr', 'US', 'TX', 'Pharr', 'MX', '2306'),
  ('Brownsville (Veterans International)', 'Brownsville', 'US', 'TX', 'Brownsville', 'MX', '2301'),
  ('Del Rio', 'Del Rio', 'US', 'TX', 'Del Rio', 'MX', '2302'),
  ('Nuevo Laredo', 'Nuevo Laredo', 'MX', 'Tamaulipas', 'Nuevo Laredo', 'US', NULL),
  ('Piedras Negras', 'Piedras Negras', 'MX', 'Coahuila', 'Piedras Negras', 'US', NULL),
  ('Reynosa', 'Reynosa', 'MX', 'Tamaulipas', 'Reynosa', 'US', NULL),
  ('Matamoros', 'Matamoros', 'MX', 'Tamaulipas', 'Matamoros', 'US', NULL)
ON CONFLICT (name, country) DO NOTHING;

ALTER TABLE mdata.unit_border_crossings
  DROP CONSTRAINT IF EXISTS unit_border_crossings_port_of_entry_id_fkey;
ALTER TABLE mdata.unit_border_crossings
  ADD CONSTRAINT unit_border_crossings_port_of_entry_id_fkey
  FOREIGN KEY (port_of_entry_id) REFERENCES reference.ports_of_entry(id);

CREATE TABLE IF NOT EXISTS reference.cbp_wait_times_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cbp_port_code TEXT NOT NULL,
  lane_type TEXT NOT NULL CHECK (lane_type IN ('standard','fast','commercial','passenger','pedestrian')),
  wait_time_minutes INTEGER,
  lanes_open INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cbp_wait_port ON reference.cbp_wait_times_cache(cbp_port_code, fetched_at DESC);

ALTER TABLE reference.cbp_wait_times_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cbp_wait_cache_read ON reference.cbp_wait_times_cache;
CREATE POLICY cbp_wait_cache_read ON reference.cbp_wait_times_cache
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS cbp_wait_cache_write ON reference.cbp_wait_times_cache;
CREATE POLICY cbp_wait_cache_write ON reference.cbp_wait_times_cache
  FOR INSERT TO ih35_app
  WITH CHECK (identity.is_lucia_bypass());

GRANT USAGE ON SCHEMA reference TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON reference.ports_of_entry TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON reference.cbp_wait_times_cache TO ih35_app;

COMMIT;
