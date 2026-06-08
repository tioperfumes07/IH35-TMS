-- GAP-62 / CAP-12: Tire tread wear measurements + replacement projections.
-- DOT thresholds: 4/32" steer, 2/32" drive/trailer (49 CFR §393.75).

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.tire_tread_measurements (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  tire_position text NOT NULL,
  tread_depth_32nds integer NOT NULL CHECK (tread_depth_32nds >= 0),
  measured_at timestamptz NOT NULL,
  measured_by_user_uuid uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('dvir_inspection', 'maintenance_pm', 'tire_service', 'samsara_smart_sensor')),
  odometer_miles integer NULL CHECK (odometer_miles IS NULL OR odometer_miles >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tread_unit_position
  ON maintenance.tire_tread_measurements (unit_uuid, tire_position, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_tread_company_measured
  ON maintenance.tire_tread_measurements (operating_company_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS maintenance.tire_projections (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  tire_position text NOT NULL,
  threshold_32nds integer NOT NULL CHECK (threshold_32nds > 0),
  current_depth_32nds integer NULL CHECK (current_depth_32nds IS NULL OR current_depth_32nds >= 0),
  projected_replacement_date date NULL,
  wear_rate_32nds_per_day numeric(12, 6) NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tire_projections_unit_position UNIQUE (operating_company_id, unit_uuid, tire_position)
);

CREATE INDEX IF NOT EXISTS idx_tire_projections_at_risk
  ON maintenance.tire_projections (operating_company_id, projected_replacement_date)
  WHERE projected_replacement_date IS NOT NULL;

ALTER TABLE maintenance.tire_tread_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.tire_projections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tire_tread_measurements_company_scope ON maintenance.tire_tread_measurements;
CREATE POLICY tire_tread_measurements_company_scope
  ON maintenance.tire_tread_measurements
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS tire_projections_company_scope ON maintenance.tire_projections;
CREATE POLICY tire_projections_company_scope
  ON maintenance.tire_projections
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON maintenance.tire_tread_measurements TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.tire_projections TO ih35_app;

COMMIT;
