BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;
CREATE SCHEMA IF NOT EXISTS maintenance;
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE IF NOT EXISTS catalogs.parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  part_number text NOT NULL,
  part_name text NOT NULL,
  default_cost numeric(10, 2),
  applies_to_unit_class text[],
  is_active boolean NOT NULL DEFAULT true,
  qbo_item_id text,
  UNIQUE (operating_company_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_parts_active
  ON catalogs.parts (operating_company_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS catalogs.labor_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  rate_code text NOT NULL,
  rate_name text NOT NULL,
  rate_per_hour numeric(8, 2) NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, rate_code)
);

CREATE TABLE IF NOT EXISTS catalogs.maintenance_part_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  location_code text NOT NULL,
  location_name text NOT NULL,
  applies_to text NOT NULL CHECK (applies_to IN ('tractor', 'trailer', 'both')),
  category text NOT NULL CHECK (category IN ('tire', 'brake', 'engine', 'body', 'suspension', 'electrical', 'reefer', 'other')),
  display_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, location_code)
);

WITH location_seed(code, name, applies_to, category, display_order) AS (
  VALUES
    ('STEER-L', 'Steer Tire - Left', 'tractor', 'tire', 10),
    ('STEER-R', 'Steer Tire - Right', 'tractor', 'tire', 11),
    ('D1L', 'Drive Axle 1 - Left', 'tractor', 'tire', 12),
    ('D1R', 'Drive Axle 1 - Right', 'tractor', 'tire', 13),
    ('D2L', 'Drive Axle 2 - Left', 'tractor', 'tire', 14),
    ('D2R', 'Drive Axle 2 - Right', 'tractor', 'tire', 15),
    ('HOOD', 'Hood', 'tractor', 'body', 20),
    ('ENGINE', 'Engine', 'tractor', 'engine', 21),
    ('CAB', 'Cab', 'tractor', 'body', 22),
    ('SLEEPER', 'Sleeper', 'tractor', 'body', 23),
    ('DEF', 'DEF System', 'tractor', 'engine', 24),
    ('TRANS', 'Transmission', 'tractor', 'engine', 25),
    ('FIFTH-WHEEL', 'Fifth Wheel', 'tractor', 'suspension', 26),
    ('FRONT-BUMPER', 'Front Bumper', 'tractor', 'body', 27),
    ('AIR-BAG-L', 'Air Bag - Left', 'tractor', 'suspension', 28),
    ('AIR-BAG-R', 'Air Bag - Right', 'tractor', 'suspension', 29),
    ('AIR-DRYER', 'Air Dryer', 'tractor', 'brake', 30),
    ('BATT-BOX', 'Battery Box', 'tractor', 'electrical', 31),
    ('FUEL-TANK-L', 'Fuel Tank - Left', 'tractor', 'body', 32),
    ('FUEL-TANK-R', 'Fuel Tank - Right', 'tractor', 'body', 33),
    ('T1L', 'Trailer Axle 1 - Left', 'trailer', 'tire', 40),
    ('T1R', 'Trailer Axle 1 - Right', 'trailer', 'tire', 41),
    ('T2L', 'Trailer Axle 2 - Left', 'trailer', 'tire', 42),
    ('T2R', 'Trailer Axle 2 - Right', 'trailer', 'tire', 43),
    ('T3L', 'Trailer Axle 3 - Left', 'trailer', 'tire', 44),
    ('T3R', 'Trailer Axle 3 - Right', 'trailer', 'tire', 45),
    ('T4L', 'Trailer Axle 4 - Left', 'trailer', 'tire', 46),
    ('T4R', 'Trailer Axle 4 - Right', 'trailer', 'tire', 47),
    ('NOSE', 'Trailer Nose', 'trailer', 'body', 48),
    ('ROOF', 'Trailer Roof', 'trailer', 'body', 49),
    ('FLOOR', 'Trailer Floor', 'trailer', 'body', 50),
    ('REAR-DOORS', 'Rear Doors', 'trailer', 'body', 51),
    ('LANDING-GEAR', 'Landing Gear', 'trailer', 'suspension', 52),
    ('L-FRONT-PANEL', 'Left Front Panel', 'trailer', 'body', 53),
    ('L-MID-PANEL', 'Left Mid Panel', 'trailer', 'body', 54),
    ('L-REAR-PANEL', 'Left Rear Panel', 'trailer', 'body', 55),
    ('R-FRONT-PANEL', 'Right Front Panel', 'trailer', 'body', 56),
    ('R-MID-PANEL', 'Right Mid Panel', 'trailer', 'body', 57),
    ('R-REAR-PANEL', 'Right Rear Panel', 'trailer', 'body', 58),
    ('ABS-MODULE', 'ABS Module', 'trailer', 'electrical', 59),
    ('REEFER-UNIT', 'Reefer Unit', 'trailer', 'reefer', 60)
)
INSERT INTO catalogs.maintenance_part_locations (
  operating_company_id,
  location_code,
  location_name,
  applies_to,
  category,
  display_order
)
SELECT
  c.id,
  s.code,
  s.name,
  s.applies_to,
  s.category,
  s.display_order
FROM org.companies c
CROSS JOIN location_seed s
ON CONFLICT (operating_company_id, location_code) DO UPDATE
SET
  location_name = EXCLUDED.location_name,
  applies_to = EXCLUDED.applies_to,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order;

CREATE TABLE IF NOT EXISTS maintenance.work_order_lines (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  work_order_uuid uuid NOT NULL,
  line_type text NOT NULL CHECK (line_type IN ('part', 'parts', 'labor', 'disposal', 'other')),
  description text NOT NULL,
  quantity numeric(10, 2) NOT NULL DEFAULT 1,
  unit_cost numeric(12, 2) NOT NULL DEFAULT 0,
  total_cost numeric(12, 2) NOT NULL DEFAULT 0
);

DO $$
DECLARE
  v_wo_table regclass := to_regclass('maintenance.work_order_lines');
BEGIN
  IF v_wo_table IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE maintenance.work_order_lines
        ADD COLUMN IF NOT EXISTS section char(1) NOT NULL DEFAULT ''B'' CHECK (section IN (''A'', ''B'')),
        ADD COLUMN IF NOT EXISTS parent_line_uuid uuid REFERENCES maintenance.work_order_lines(uuid),
        ADD COLUMN IF NOT EXISTS expense_category_uuid uuid,
        ADD COLUMN IF NOT EXISTS service_item_uuid uuid,
        ADD COLUMN IF NOT EXISTS part_uuid uuid,
        ADD COLUMN IF NOT EXISTS labor_rate_uuid uuid,
        ADD COLUMN IF NOT EXISTS part_location_codes text[]
    ';
  END IF;

  IF v_wo_table IS NOT NULL
     AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_wo_line_section_a_has_category'
      AND conrelid = v_wo_table
  ) THEN
    EXECUTE '
      ALTER TABLE maintenance.work_order_lines
        ADD CONSTRAINT chk_wo_line_section_a_has_category CHECK (
          section <> ''A''
          OR (expense_category_uuid IS NOT NULL AND parent_line_uuid IS NULL AND part_location_codes IS NULL)
        )
    ';
  END IF;

  IF v_wo_table IS NOT NULL
     AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_wo_line_parts_subrow_has_part'
      AND conrelid = v_wo_table
  ) THEN
    EXECUTE '
      ALTER TABLE maintenance.work_order_lines
        ADD CONSTRAINT chk_wo_line_parts_subrow_has_part CHECK (
          parent_line_uuid IS NULL
          OR (line_type IN (''part'', ''parts'') AND part_uuid IS NOT NULL)
          OR (line_type = ''labor'' AND labor_rate_uuid IS NOT NULL)
        )
    ';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS accounting.bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  line_sequence int NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bill_id, line_sequence)
);

CREATE TABLE IF NOT EXISTS accounting.expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL,
  line_sequence int NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, line_sequence)
);

ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS section char(1) NOT NULL DEFAULT 'B' CHECK (section IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS parent_line_uuid uuid REFERENCES accounting.bill_lines(id),
  ADD COLUMN IF NOT EXISTS expense_category_uuid uuid,
  ADD COLUMN IF NOT EXISTS service_item_uuid uuid,
  ADD COLUMN IF NOT EXISTS part_uuid uuid,
  ADD COLUMN IF NOT EXISTS labor_rate_uuid uuid,
  ADD COLUMN IF NOT EXISTS part_location_codes text[],
  ADD COLUMN IF NOT EXISTS linked_wo_line_uuid uuid;

ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS section char(1) NOT NULL DEFAULT 'B' CHECK (section IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS parent_line_uuid uuid REFERENCES accounting.expense_lines(id),
  ADD COLUMN IF NOT EXISTS expense_category_uuid uuid,
  ADD COLUMN IF NOT EXISTS service_item_uuid uuid,
  ADD COLUMN IF NOT EXISTS part_uuid uuid,
  ADD COLUMN IF NOT EXISTS labor_rate_uuid uuid,
  ADD COLUMN IF NOT EXISTS part_location_codes text[],
  ADD COLUMN IF NOT EXISTS linked_wo_line_uuid uuid;

DO $$
BEGIN
  IF to_regclass('safety.fines') IS NOT NULL
     AND to_regclass('safety.civil_fines') IS NULL THEN
    ALTER TABLE safety.fines RENAME TO civil_fines;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS catalogs.internal_fine_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reason_code text NOT NULL,
  reason_name text NOT NULL,
  default_amount numeric(8, 2),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, reason_code)
);

CREATE TABLE IF NOT EXISTS catalogs.company_violation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  type_code text NOT NULL,
  type_name text NOT NULL,
  default_severity smallint,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, type_code)
);

CREATE TABLE IF NOT EXISTS catalogs.complaint_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  type_code text NOT NULL,
  type_name text NOT NULL,
  default_severity text,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, type_code)
);

CREATE TABLE IF NOT EXISTS safety.internal_fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  reason_id uuid NOT NULL REFERENCES catalogs.internal_fine_reasons(id),
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  imposed_date date NOT NULL,
  imposed_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  approved_by_user_id uuid REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disputed', 'converted_to_liability', 'voided')),
  related_load_id uuid REFERENCES mdata.loads(id),
  notes text,
  driver_liability_id uuid,
  voided_at timestamptz,
  voided_reason text
);

DO $$
BEGIN
  IF to_regclass('safety.company_violations') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE safety.company_violations
        ADD COLUMN IF NOT EXISTS violation_type_uuid uuid REFERENCES catalogs.company_violation_types(id),
        ADD COLUMN IF NOT EXISTS violation_type_id uuid REFERENCES catalogs.company_violation_types(id),
        ADD COLUMN IF NOT EXISTS severity smallint CHECK (severity BETWEEN 1 AND 10),
        ADD COLUMN IF NOT EXISTS evidence_doc_ids uuid[],
        ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN (''warning'', ''written_reprimand'', ''monetary_fine'', ''termination'', ''dismissed''))
    ';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS safety.dot_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  inspection_date date NOT NULL,
  driver_id uuid REFERENCES mdata.drivers(id),
  unit_id uuid REFERENCES mdata.units(id),
  inspector_name text NOT NULL,
  inspection_level smallint NOT NULL CHECK (inspection_level BETWEEN 1 AND 6),
  location text,
  outcome text NOT NULL CHECK (outcome IN ('PASS', 'WARNING', 'OOS')),
  cited_violations jsonb,
  csa_basic_total_points int,
  pdf_evidence_id uuid,
  spawned_wo_id uuid,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_dot_inspections_unit_date
  ON safety.dot_inspections (unit_id, inspection_date);

CREATE INDEX IF NOT EXISTS idx_dot_inspections_oos
  ON safety.dot_inspections (operating_company_id)
  WHERE outcome = 'OOS';

CREATE TABLE IF NOT EXISTS safety.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  complaint_date date NOT NULL,
  complainant_type text NOT NULL CHECK (complainant_type IN ('driver', 'customer', 'employee', 'external', 'anonymous')),
  complainant_name text,
  complainant_id uuid,
  respondent_type text NOT NULL CHECK (respondent_type IN ('driver', 'employee')),
  respondent_id uuid NOT NULL,
  complaint_type_id uuid NOT NULL REFERENCES catalogs.complaint_types(id),
  summary text NOT NULL,
  evidence_doc_ids uuid[],
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed', 'escalated')),
  investigation_notes text,
  resolution text,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES identity.users(id)
);

ALTER TABLE safety.complaints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'safety'
      AND tablename = 'complaints'
      AND policyname = 'complaints_select_privileged'
  ) THEN
    CREATE POLICY complaints_select_privileged
      ON safety.complaints
      FOR SELECT
      USING (
        operating_company_id = current_setting('app.operating_company_id', true)::uuid
        AND COALESCE(current_setting('app.user_role', true), identity.current_user_role()::text) IN ('Owner', 'Administrator', 'Safety')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'safety'
      AND tablename = 'complaints'
      AND policyname = 'complaints_mutate_privileged'
  ) THEN
    CREATE POLICY complaints_mutate_privileged
      ON safety.complaints
      FOR ALL
      USING (
        operating_company_id = current_setting('app.operating_company_id', true)::uuid
        AND COALESCE(current_setting('app.user_role', true), identity.current_user_role()::text) IN ('Owner', 'Administrator', 'Safety')
      )
      WITH CHECK (
        operating_company_id = current_setting('app.operating_company_id', true)::uuid
        AND COALESCE(current_setting('app.user_role', true), identity.current_user_role()::text) IN ('Owner', 'Administrator', 'Safety')
      );
  END IF;
END
$$;

WITH seed(reason_code, reason_name, default_amount) AS (
  VALUES
    ('LATE-DELIVERY', 'Late Delivery', 50.00),
    ('CLEANLINESS', 'Cleanliness', 25.00),
    ('MISSED-BOL', 'Missed BOL', 25.00),
    ('MISSED-APPT', 'Missed Appointment', 100.00),
    ('GOVERNOR-OVERRIDE', 'Governor Override', 150.00),
    ('HOS-POLICY', 'HOS Policy', 75.00)
)
INSERT INTO catalogs.internal_fine_reasons (operating_company_id, reason_code, reason_name, default_amount)
SELECT c.id, s.reason_code, s.reason_name, s.default_amount
FROM org.companies c
CROSS JOIN seed s
ON CONFLICT (operating_company_id, reason_code) DO UPDATE
SET
  reason_name = EXCLUDED.reason_name,
  default_amount = EXCLUDED.default_amount,
  is_active = true;

WITH seed(type_code, type_name, default_severity) AS (
  VALUES
    ('DRIVE-WITHOUT-PERMISSION', 'Drive Without Permission', 8),
    ('PERSONAL-USE-NO-AUTH', 'Personal Use Without Authorization', 6),
    ('UNAUTH-PASSENGER', 'Unauthorized Passenger', 5),
    ('HOS-POLICY-VIOLATION', 'HOS Policy Violation', 7),
    ('GOVERNOR-OVERRIDE', 'Governor Override', 9)
)
INSERT INTO catalogs.company_violation_types (operating_company_id, type_code, type_name, default_severity)
SELECT c.id, s.type_code, s.type_name, s.default_severity
FROM org.companies c
CROSS JOIN seed s
ON CONFLICT (operating_company_id, type_code) DO UPDATE
SET
  type_name = EXCLUDED.type_name,
  default_severity = EXCLUDED.default_severity,
  is_active = true;

WITH seed(type_code, type_name, default_severity) AS (
  VALUES
    ('HARASSMENT', 'Harassment', 'high'),
    ('MISCONDUCT', 'Misconduct', 'high'),
    ('SERVICE-QUALITY', 'Service Quality', 'medium'),
    ('COMMUNICATION', 'Communication', 'medium'),
    ('SAFETY-CONCERN', 'Safety Concern', 'critical'),
    ('RETALIATION', 'Retaliation', 'critical'),
    ('OTHER', 'Other', 'low')
)
INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity)
SELECT c.id, s.type_code, s.type_name, s.default_severity
FROM org.companies c
CROSS JOIN seed s
ON CONFLICT (operating_company_id, type_code) DO UPDATE
SET
  type_name = EXCLUDED.type_name,
  default_severity = EXCLUDED.default_severity,
  is_active = true;

COMMIT;
