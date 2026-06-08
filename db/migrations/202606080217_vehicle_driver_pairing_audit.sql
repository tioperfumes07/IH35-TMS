-- GAP-59 / CAP-9: vehicle-driver pairing audit — samsara_assignment_id + overlap flags
BEGIN;

ALTER TABLE telematics.vehicle_driver_assignments
  ADD COLUMN IF NOT EXISTS samsara_assignment_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_driver_assignments_samsara_id
  ON telematics.vehicle_driver_assignments (operating_company_id, samsara_assignment_id)
  WHERE samsara_assignment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telematics.vehicle_driver_pairing_overlap_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  assignment_id_a uuid NOT NULL REFERENCES telematics.vehicle_driver_assignments(id),
  assignment_id_b uuid NOT NULL REFERENCES telematics.vehicle_driver_assignments(id),
  unit_id_a uuid NOT NULL REFERENCES mdata.units(id),
  unit_id_b uuid NOT NULL REFERENCES mdata.units(id),
  overlap_started_at timestamptz NOT NULL,
  overlap_ended_at timestamptz NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT vehicle_driver_pairing_overlap_distinct_assignments CHECK (assignment_id_a <> assignment_id_b),
  CONSTRAINT vehicle_driver_pairing_overlap_distinct_units CHECK (unit_id_a <> unit_id_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_driver_pairing_overlap_pair
  ON telematics.vehicle_driver_pairing_overlap_flags (
    operating_company_id,
    assignment_id_a,
    assignment_id_b,
    overlap_started_at
  );

CREATE INDEX IF NOT EXISTS idx_vehicle_driver_pairing_overlap_driver
  ON telematics.vehicle_driver_pairing_overlap_flags (operating_company_id, driver_id, detected_at DESC);

ALTER TABLE telematics.vehicle_driver_pairing_overlap_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_driver_pairing_overlap_company_scope ON telematics.vehicle_driver_pairing_overlap_flags;
CREATE POLICY vehicle_driver_pairing_overlap_company_scope
  ON telematics.vehicle_driver_pairing_overlap_flags
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA telematics TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON telematics.vehicle_driver_pairing_overlap_flags TO ih35_app;

COMMIT;
