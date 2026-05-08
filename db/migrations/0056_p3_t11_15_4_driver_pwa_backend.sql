BEGIN;

CREATE SCHEMA IF NOT EXISTS dispatch;
CREATE SCHEMA IF NOT EXISTS maintenance;
CREATE SCHEMA IF NOT EXISTS driver_finance;

-- Ensure dispatch in-transit issue table exists (critical T11.15.4 fix path).
CREATE TABLE IF NOT EXISTS dispatch.intransit_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid REFERENCES mdata.loads(id) ON DELETE SET NULL,
  stop_id uuid REFERENCES mdata.load_stops(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES mdata.units(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  issue_type text,
  issue_category text NOT NULL DEFAULT 'other',
  issue_description text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'severe')),
  status text NOT NULL DEFAULT 'open',
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  gps_label text,
  photo_keys text[] NOT NULL DEFAULT '{}',
  promoted_to_wo_id uuid,
  promoted_to_damage_report_id uuid,
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intransit_issues_driver_reported
  ON dispatch.intransit_issues(driver_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_intransit_issues_unit_reported
  ON dispatch.intransit_issues(unit_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_intransit_issues_load
  ON dispatch.intransit_issues(load_id);
CREATE INDEX IF NOT EXISTS idx_intransit_issues_status
  ON dispatch.intransit_issues(status);

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_driver_id uuid REFERENCES mdata.drivers(id);

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS is_oos boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata'
      AND t.typname = 'stop_status_enum'
  ) THEN
    ALTER TYPE mdata.stop_status_enum ADD VALUE IF NOT EXISTS 'loading';
    ALTER TYPE mdata.stop_status_enum ADD VALUE IF NOT EXISTS 'loaded';
    ALTER TYPE mdata.stop_status_enum ADD VALUE IF NOT EXISTS 'unloaded';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- WF-051 signed acknowledgments (load acceptance)
CREATE TABLE IF NOT EXISTS driver_finance.signed_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  signature_data_url text NOT NULL,
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  geo_accuracy_m int,
  scroll_completed boolean NOT NULL DEFAULT false,
  user_agent text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signed_ack_driver
  ON driver_finance.signed_acknowledgments(driver_id, acknowledged_at DESC);
CREATE INDEX IF NOT EXISTS idx_signed_ack_load
  ON driver_finance.signed_acknowledgments(load_id);

-- WF-050 DVIR submissions
CREATE TABLE IF NOT EXISTS maintenance.dvir_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  load_id uuid REFERENCES mdata.loads(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  trailer_id uuid REFERENCES mdata.units(id),
  type text NOT NULL CHECK (type IN ('pre_trip', 'post_trip')),
  odometer int NOT NULL,
  location text NOT NULL,
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  items jsonb NOT NULL,
  certified boolean NOT NULL DEFAULT false,
  signature_data_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  has_major_defect boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_dvir_driver_load
  ON maintenance.dvir_submissions(driver_id, load_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dvir_unit
  ON maintenance.dvir_submissions(unit_id, submitted_at DESC);

-- DVIR defects
CREATE TABLE IF NOT EXISTS maintenance.defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  dvir_submission_id uuid NOT NULL REFERENCES maintenance.dvir_submissions(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  item_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor', 'major')),
  notes text NOT NULL,
  photo_keys text[] NOT NULL DEFAULT '{}',
  resolved_at timestamptz,
  resolved_by_wo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defects_unit_open
  ON maintenance.defects(unit_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_defects_severity_open
  ON maintenance.defects(severity, created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE dispatch.intransit_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.signed_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.dvir_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.defects ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON dispatch.intransit_issues TO ih35_app;
GRANT SELECT, INSERT ON driver_finance.signed_acknowledgments TO ih35_app;
GRANT SELECT, INSERT ON maintenance.dvir_submissions TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.defects TO ih35_app;

DROP POLICY IF EXISTS intransit_issues_driver_self_rw ON dispatch.intransit_issues;
CREATE POLICY intransit_issues_driver_self_rw ON dispatch.intransit_issues
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum,
        'Mechanic'::identity.role_enum,
        'Safety'::identity.role_enum
      ]
    )
    OR driver_id = (
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
      LIMIT 1
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum,
        'Mechanic'::identity.role_enum,
        'Safety'::identity.role_enum
      ]
    )
    OR driver_id = (
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS signed_ack_driver_self_rw ON driver_finance.signed_acknowledgments;
CREATE POLICY signed_ack_driver_self_rw ON driver_finance.signed_acknowledgments
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Accountant'::identity.role_enum
      ]
    )
    OR driver_id = (
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
      LIMIT 1
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Accountant'::identity.role_enum
      ]
    )
    OR driver_id = (
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS dvir_submissions_driver_self_rw ON maintenance.dvir_submissions;
CREATE POLICY dvir_submissions_driver_self_rw ON maintenance.dvir_submissions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Mechanic'::identity.role_enum,
        'Safety'::identity.role_enum
      ]
    )
    OR driver_id = (
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
      LIMIT 1
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Mechanic'::identity.role_enum,
        'Safety'::identity.role_enum
      ]
    )
    OR driver_id = (
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS defects_driver_self_rw ON maintenance.defects;
CREATE POLICY defects_driver_self_rw ON maintenance.defects
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Mechanic'::identity.role_enum,
        'Safety'::identity.role_enum
      ]
    )
    OR operating_company_id IN (
      SELECT l.operating_company_id
      FROM mdata.loads l
      JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id OR d.id = l.assigned_secondary_driver_id
      WHERE d.identity_user_id = identity.current_user_id()
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Mechanic'::identity.role_enum,
        'Safety'::identity.role_enum
      ]
    )
    OR operating_company_id IN (
      SELECT l.operating_company_id
      FROM mdata.loads l
      JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id OR d.id = l.assigned_secondary_driver_id
      WHERE d.identity_user_id = identity.current_user_id()
    )
  );

COMMIT;
