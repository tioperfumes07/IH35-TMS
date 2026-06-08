-- GAP-63 / CAP-13: Brake lining wear measurements + replacement projections.
-- DOT minimums: 6.4 mm (1/4") steer · 3.2 mm (1/8") drive (49 CFR §393.47).

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.brake_wear_measurements (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  brake_position text NOT NULL,
  lining_thickness_mm numeric(5, 2) NOT NULL CHECK (lining_thickness_mm >= 0),
  measured_at timestamptz NOT NULL,
  measured_by_user_uuid uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('dvir', 'pm_inspection', 'brake_service', 'samsara_diagnostics')),
  odometer_miles integer NULL CHECK (odometer_miles IS NULL OR odometer_miles >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brake_unit_pos
  ON maintenance.brake_wear_measurements (unit_uuid, brake_position, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_brake_company_measured
  ON maintenance.brake_wear_measurements (operating_company_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS maintenance.brake_projections (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  brake_position text NOT NULL,
  threshold_mm numeric(5, 2) NOT NULL CHECK (threshold_mm > 0),
  current_thickness_mm numeric(5, 2) NULL CHECK (current_thickness_mm IS NULL OR current_thickness_mm >= 0),
  projected_replacement_date date NULL,
  wear_rate_mm_per_day numeric(12, 6) NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_brake_projections_unit_position UNIQUE (operating_company_id, unit_uuid, brake_position)
);

CREATE INDEX IF NOT EXISTS idx_brake_projections_at_risk
  ON maintenance.brake_projections (operating_company_id, projected_replacement_date)
  WHERE projected_replacement_date IS NOT NULL;

ALTER TABLE maintenance.brake_wear_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.brake_projections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brake_wear_measurements_company_scope ON maintenance.brake_wear_measurements;
CREATE POLICY brake_wear_measurements_company_scope
  ON maintenance.brake_wear_measurements
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS brake_projections_company_scope ON maintenance.brake_projections;
CREATE POLICY brake_projections_company_scope
  ON maintenance.brake_projections
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON maintenance.brake_wear_measurements TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.brake_projections TO ih35_app;

COMMIT;
