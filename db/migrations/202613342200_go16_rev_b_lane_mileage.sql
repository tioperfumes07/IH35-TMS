-- GO-16 Rev B. Owner 2026-09-01.
-- You do what the owner says, the first time, in the live app.
-- Reference data only. No loads, invoices, bills, expenses, or journal entries.
-- Reuse mdata.loads.miles_practical / miles_shortest. Do not add a second mileage pair.

BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.lane_mileage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  origin_city text NOT NULL,
  origin_state text NOT NULL,
  origin_postal_code text NULL,
  dest_city text NOT NULL,
  dest_state text NOT NULL,
  dest_postal_code text NULL,
  practical_miles numeric(8,1) NOT NULL,
  short_miles numeric(8,1) NULL,
  empty_miles numeric(8,1) NOT NULL DEFAULT 0,
  n_practical integer NOT NULL DEFAULT 0,
  n_short integer NOT NULL DEFAULT 0,
  practical_min numeric(8,1),
  practical_max numeric(8,1),
  practical_spread numeric(8,1),
  short_min numeric(8,1),
  short_max numeric(8,1),
  confidence text NOT NULL CHECK (confidence IN ('High', 'Check ZIP', 'Thin', 'Manual')),
  autofill_allowed boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('History', 'Manual', 'Routing engine')),
  first_seen date,
  last_seen date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lane_city_pair ON catalogs.lane_mileage
  (operating_company_id, origin_city, origin_state, dest_city, dest_state)
  WHERE origin_postal_code IS NULL AND dest_postal_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lane_zip_pair ON catalogs.lane_mileage
  (operating_company_id, origin_postal_code, dest_postal_code)
  WHERE origin_postal_code IS NOT NULL AND dest_postal_code IS NOT NULL;

ALTER TABLE catalogs.lane_mileage ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.lane_mileage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lane_mileage_company ON catalogs.lane_mileage;
CREATE POLICY lane_mileage_company ON catalogs.lane_mileage
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.lane_mileage TO ih35_app;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS mileage_source text,
  ADD COLUMN IF NOT EXISTS mileage_variance_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_count text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_mileage_source_english_check'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_mileage_source_english_check
      CHECK (
        mileage_source IS NULL OR mileage_source IN (
          'History', 'Manual', 'Routing engine', 'Operator entered'
        )
      );
  END IF;
END $$;

COMMIT;
