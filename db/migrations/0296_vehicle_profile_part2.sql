-- Block 12: Vehicle Profile Part 2 — reefer columns on equipment, unit_photos gallery
BEGIN;

ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS reefer_year integer,
  ADD COLUMN IF NOT EXISTS reefer_brand text,
  ADD COLUMN IF NOT EXISTS reefer_model text,
  ADD COLUMN IF NOT EXISTS reefer_setpoint_temp_f numeric,
  ADD COLUMN IF NOT EXISTS reefer_fuel_capacity_gal numeric,
  ADD COLUMN IF NOT EXISTS reefer_service_interval_hours integer DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS reefer_last_service_hours numeric,
  ADD COLUMN IF NOT EXISTS reefer_last_service_date date,
  ADD COLUMN IF NOT EXISTS reefer_notes text;

CREATE TABLE IF NOT EXISTS mdata.unit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  uploaded_by_driver_id uuid,
  uploaded_by_user_id uuid,
  photo_url text NOT NULL,
  photo_type text NOT NULL CHECK (photo_type IN ('damage', 'cleanliness', 'mod', 'interior', 'exterior', 'other')),
  caption text,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_unit_photos_unit_id ON mdata.unit_photos (unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_photos_operating_company ON mdata.unit_photos (operating_company_id);
CREATE INDEX IF NOT EXISTS idx_unit_photos_taken_at ON mdata.unit_photos (taken_at DESC);

ALTER TABLE mdata.unit_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_photos_company_isolation ON mdata.unit_photos;
CREATE POLICY unit_photos_company_isolation ON mdata.unit_photos
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON mdata.unit_photos TO ih35_app;

COMMIT;
