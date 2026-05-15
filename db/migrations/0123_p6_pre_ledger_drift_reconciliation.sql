-- HOTFIX 0123 — generated reconciliation for pre-ledger drift (0001-0114)
-- Generated from artifacts/pre-ledger-drift-report.json by script
BEGIN;

-- Ensure missing schemas exist before replaying reconciled DDL.
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS banking;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS factor;
CREATE SCHEMA IF NOT EXISTS reports;

-- ===== From 0008_mdata_init.sql =====
CREATE INDEX IF NOT EXISTS idx_locations_location_type ON mdata.locations (location_type);

-- ===== From 0014_user_company_access.sql =====
INSERT INTO org.user_company_access (user_id, company_id)
SELECT u.id, c.id
FROM identity.users u
CROSS JOIN org.companies c
WHERE u.email = 'tioperfumes07@gmail.com'
  AND c.deactivated_at IS NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ===== From 0035_load_cancellation_reasons.sql =====
WITH owner_user AS (
  SELECT id
  FROM identity.users
  WHERE role = 'Owner'
  ORDER BY created_at
  LIMIT 1
),
seed(reason_code, display_name, category, sort_order, description) AS (
  VALUES
    ('CUST_NO_LONGER_NEEDED', 'Customer no longer needs load', 'customer_initiated', 10, 'Customer cancelled because the underlying need went away'),
    ('CUST_RATE_TOO_LOW', 'Customer found cheaper rate elsewhere', 'customer_initiated', 20, 'Customer awarded load to another carrier with lower rate'),
    ('CUST_NO_SHOW_AT_PICKUP', 'Customer no-show at pickup', 'customer_initiated', 30, 'Driver arrived for pickup but customer/load not ready or not present'),
    ('CUST_DOUBLE_BROKERED', 'Load was double-brokered', 'customer_initiated', 40, 'Customer (broker) cancelled because they double-brokered the load'),
    ('CARR_NO_AVAILABLE_UNIT', 'No available unit', 'carrier_initiated', 50, 'No truck available in time window'),
    ('CARR_NO_AVAILABLE_DRIVER', 'No available driver', 'carrier_initiated', 60, 'No driver available with required qualifications'),
    ('CARR_EQUIPMENT_INCOMPATIBLE', 'Equipment incompatible with load', 'carrier_initiated', 70, 'Required equipment not in fleet or available'),
    ('CARR_RATE_NEGOTIATION_FAILED', 'Rate negotiation failed', 'carrier_initiated', 80, 'Could not agree on rate with customer'),
    ('CARR_BROKER_AUTHORITY_RED_FLAG', 'Broker authority red flag', 'carrier_initiated', 90, 'FMCSA verification or credit check failed'),
    ('FORCE_WEATHER', 'Weather event', 'force_majeure', 100, 'Severe weather preventing safe operation'),
    ('FORCE_ACCIDENT', 'Accident / road closure', 'force_majeure', 110, 'Highway accident or closure preventing pickup or delivery'),
    ('OTHER', 'Other (see notes)', 'other', 200, 'Reason not in standard list — see cancellation notes')
)
INSERT INTO catalogs.load_cancellation_reasons (
  operating_company_id,
  reason_code,
  display_name,
  category,
  sort_order,
  description,
  created_by_user_id
)
SELECT
  c.id,
  s.reason_code,
  s.display_name,
  s.category::catalogs.cancellation_category_enum,
  s.sort_order,
  s.description,
  o.id
FROM org.companies c
CROSS JOIN seed s
CROSS JOIN owner_user o
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, reason_code) DO NOTHING;

-- ===== From 0036_locations_expansion.sql =====
WITH owner_user AS (
  SELECT id
  FROM identity.users
  WHERE role = 'Owner'
  ORDER BY created_at
  LIMIT 1
),
seed(name, location_type, address_line1, city, state, country, latitude, longitude, phone, notes, appointment_required, dock_high, power_only_friendly, drop_trailer_friendly) AS (
  VALUES
    ('IH 35 Office Laredo', 'office', '123 Main St', 'Laredo', 'TX', 'US', 27.5036, -99.5076, '+19565551000', 'Company office', false, false, false, false),
    ('Laredo World Trade Bridge', 'border_crossing', '5410 Bob Bullock Loop', 'Laredo', 'TX', 'US', 27.5897, -99.4877, NULL, 'Commercial truck crossing — IBC bridge — heavy southbound mornings, northbound afternoons', false, false, true, true),
    ('Laredo Colombia Bridge', 'border_crossing', '15 Pacific Hwy', 'Laredo', 'TX', 'US', 27.7039, -99.6336, NULL, 'Alternative crossing — usually less wait', false, false, true, true),
    ('El Paso BOTA', 'border_crossing', 'Bridge of the Americas', 'El Paso', 'TX', 'US', 31.7674, -106.4486, NULL, 'Bridge of the Americas — commercial', false, false, true, true),
    ('Port of Houston Bayport', 'port', '12211 Port Rd', 'Seabrook', 'TX', 'US', 29.6244, -95.0193, '+17134700000', 'Bayport container terminal — appointments required', true, true, false, true),
    ('Pilot Flying J Laredo', 'fuel_stop', '5202 San Bernardo Ave', 'Laredo', 'TX', 'US', 27.5694, -99.4951, '+19567241640', 'Pilot truck stop — diesel + DEF + showers', false, false, false, false),
    ('Loves Laredo', 'fuel_stop', '6519 N Bartlett Ave', 'Laredo', 'TX', 'US', 27.5833, -99.4794, '+19567176600', 'Loves truck stop', false, false, false, false),
    ('TA Laredo', 'truck_stop', '6010 N San Bernardo Ave', 'Laredo', 'TX', 'US', 27.5759, -99.4938, '+19567245550', 'TravelCenters of America — full service', false, false, false, false),
    ('Pilot Flying J San Antonio S', 'fuel_stop', '8520 Interstate 35 S', 'San Antonio', 'TX', 'US', 29.3057, -98.5311, '+12106229401', 'Pilot San Antonio south', false, false, false, false)
)
INSERT INTO mdata.locations (
  operating_company_id,
  location_name,
  location_type,
  address_line1,
  city,
  state,
  country,
  latitude,
  longitude,
  geocoded_at,
  geocoding_source,
  phone,
  notes,
  appointment_required,
  dock_high,
  power_only_friendly,
  drop_trailer_friendly,
  created_by_user_id,
  updated_by_user_id
)
SELECT
  c.id,
  s.name,
  s.location_type::mdata.location_type_enum,
  s.address_line1,
  s.city,
  s.state,
  s.country,
  s.latitude::numeric(10, 7),
  s.longitude::numeric(10, 7),
  now(),
  'manual',
  s.phone,
  s.notes,
  s.appointment_required,
  s.dock_high,
  s.power_only_friendly,
  s.drop_trailer_friendly,
  o.id,
  o.id
FROM org.companies c
CROSS JOIN seed s
CROSS JOIN owner_user o
WHERE c.deactivated_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM mdata.locations existing
    WHERE existing.operating_company_id = c.id
      AND existing.location_name = s.name
  );

-- ===== From 0038_dispatch_flag_colors.sql =====
WITH owner_user AS (
  SELECT id
  FROM identity.users
  WHERE role = 'Owner'
  ORDER BY created_at
  LIMIT 1
),
seed(flag_code, display_name, hex_color, icon_emoji, severity_order, description, sort_order) AS (
  VALUES
    ('GRAY', 'Pending Assignment', '#9ca3af', '⚪', 5, 'Load entered but not yet assigned to unit/driver', 10),
    ('GREEN', 'On Schedule', '#10b981', '🟢', 10, 'Load proceeding on schedule, no issues', 20),
    ('BLUE', 'Completed', '#3b82f6', '🔵', 15, 'Delivered, awaiting paperwork or invoicing', 30),
    ('YELLOW', 'At Risk', '#eab308', '🟡', 50, 'Risk factors: tight appointment, weather, traffic', 40),
    ('ORANGE', 'Needs Attention', '#f97316', '🟠', 65, 'Driver missed check-in or late departure', 50),
    ('RED', 'Late / Critical', '#ef4444', '🔴', 90, 'Missed appointment, accident, breakdown, or critical', 60),
    ('PURPLE', 'Special Handling', '#a855f7', '🟣', 40, 'Hazmat, oversized, refrigerated, or security escort', 70),
    ('BLACK', 'Cancelled', '#1f2937', '⚫', 100, 'Load cancelled — see cancellation reason', 80)
)
INSERT INTO catalogs.dispatch_flag_colors (
  operating_company_id,
  flag_code,
  display_name,
  hex_color,
  icon_emoji,
  severity_order,
  description,
  sort_order,
  created_by_user_id
)
SELECT
  c.id,
  s.flag_code,
  s.display_name,
  s.hex_color,
  s.icon_emoji,
  s.severity_order,
  s.description,
  s.sort_order,
  o.id
FROM org.companies c
CROSS JOIN seed s
CROSS JOIN owner_user o
WHERE c.deactivated_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.dispatch_flag_colors existing
    WHERE existing.operating_company_id = c.id
      AND existing.flag_code = s.flag_code
  );

-- ===== From 0042_p3_t11_7_settlement_screen.sql =====
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND to_regclass('driver_finance.deduction_schedule') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.driver_settlement_with_debt
      WITH (security_invoker = true)
      AS
      SELECT
        s.id,
        s.driver_id,
        s.period_start,
        s.period_end,
        s.status,
        s.gross_pay,
        s.deductions_total,
        s.reimbursements_total,
        s.net_pay,
        s.acknowledged_at,
        s.acknowledged_by_user_id,
        s.locked_at,
        s.paid_at,
        s.paid_via_bank_txn_id,
        concat_ws(' ', d.first_name, d.last_name) AS driver_full_name,
        d.id::text AS driver_display_id,
        EXISTS (
          SELECT 1
          FROM driver_finance.deduction_schedule ds
          WHERE ds.driver_id = s.driver_id
            AND ds.requires_acknowledgment = true
            AND ds.acknowledgment_uuid IS NULL
        ) AS has_pending_acks
      FROM driver_finance.driver_settlements s
      JOIN mdata.drivers d ON d.id = s.driver_id
    $VIEW$;

    EXECUTE $INDEX$
      CREATE INDEX IF NOT EXISTS idx_settlements_period_status
      ON driver_finance.driver_settlements (period_start, period_end, status)
    $INDEX$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.driver_settlement_with_debt
      WITH (security_invoker = true)
      AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS driver_id,
        NULL::date AS period_start,
        NULL::date AS period_end,
        NULL::text AS status,
        NULL::numeric AS gross_pay,
        NULL::numeric AS deductions_total,
        NULL::numeric AS reimbursements_total,
        NULL::numeric AS net_pay,
        NULL::timestamptz AS acknowledged_at,
        NULL::uuid AS acknowledged_by_user_id,
        NULL::timestamptz AS locked_at,
        NULL::timestamptz AS paid_at,
        NULL::uuid AS paid_via_bank_txn_id,
        NULL::text AS driver_full_name,
        NULL::text AS driver_display_id,
        false AS has_pending_acks
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

-- ===== From 0050_safety_gaps_fill.sql =====
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_liabilities
      ADD COLUMN IF NOT EXISTS origin text,
      ADD COLUMN IF NOT EXISTS origin_id uuid,
      ADD COLUMN IF NOT EXISTS reference_doc_id uuid,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_recovery';
  END IF;
END
$$;

-- ===== From 0050_two_section_v5_and_safety_restructure.sql =====
CREATE SCHEMA IF NOT EXISTS accounting;
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
CREATE TABLE IF NOT EXISTS catalogs.internal_fine_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reason_code text NOT NULL,
  reason_name text NOT NULL,
  default_amount numeric(8, 2),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, reason_code)
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

-- ===== From 0051_arriving_soon_views.sql =====
DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('maintenance.arriving_soon.viewed'),
      ('maintenance.arriving_soon.converted_to_wo')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

-- ===== From 0051_p3_t11_17_2_safety_v6_4_schema.sql =====
-- Table 1: safety.hos_violations
CREATE TABLE IF NOT EXISTS safety.hos_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  violation_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT,
  source TEXT NOT NULL CHECK (source IN ('samsara_auto','manual_office','dot_citation')),
  related_load_id UUID REFERENCES mdata.loads(id),
  related_dot_inspection_id UUID,
  notes TEXT,
  csa_points INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES identity.users(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES identity.users(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_hos_viol_driver ON safety.hos_violations(driver_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_hos_viol_company_date ON safety.hos_violations(operating_company_id, occurred_at DESC);
-- Table 2: safety.dot_inspections
CREATE TABLE IF NOT EXISTS safety.dot_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  unit_id UUID REFERENCES mdata.units(id),
  trailer_id UUID,
  inspection_date TIMESTAMPTZ NOT NULL,
  inspector_name TEXT,
  fmcsa_level INT NOT NULL CHECK (fmcsa_level BETWEEN 1 AND 6),
  location TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('PASS','WARNING','OOS')),
  csa_basic_categories TEXT[],
  csa_points INT DEFAULT 0,
  violations_jsonb JSONB,
  inspection_pdf_url TEXT,
  auto_spawned_wo_id UUID REFERENCES maintenance.work_orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES identity.users(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES identity.users(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_dot_insp_driver ON safety.dot_inspections(driver_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_dot_insp_company_date ON safety.dot_inspections(operating_company_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_dot_insp_outcome ON safety.dot_inspections(outcome) WHERE outcome = 'OOS';
ALTER TABLE safety.dot_inspections
  ADD COLUMN IF NOT EXISTS trailer_id UUID,
  ADD COLUMN IF NOT EXISTS fmcsa_level INT,
  ADD COLUMN IF NOT EXISTS csa_basic_categories TEXT[],
  ADD COLUMN IF NOT EXISTS csa_points INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS violations_jsonb JSONB,
  ADD COLUMN IF NOT EXISTS inspection_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS auto_spawned_wo_id UUID REFERENCES maintenance.work_orders(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
-- Table 3: safety.csa_scores
CREATE TABLE IF NOT EXISTS safety.csa_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  basic_unsafe_driving NUMERIC(5,2),
  basic_hos_compliance NUMERIC(5,2),
  basic_driver_fitness NUMERIC(5,2),
  basic_controlled_substances NUMERIC(5,2),
  basic_vehicle_maintenance NUMERIC(5,2),
  basic_hazmat NUMERIC(5,2),
  basic_crash_indicator NUMERIC(5,2),
  total_inspections INT DEFAULT 0,
  total_violations INT DEFAULT 0,
  total_oos INT DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  computed_by TEXT NOT NULL,
  source_url TEXT,
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_csa_score_unique_period
  ON safety.csa_scores(operating_company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_csa_score_company_date ON safety.csa_scores(operating_company_id, period_end DESC);
-- Table 4: safety.complaints (PRIVACY GATED)
CREATE TABLE IF NOT EXISTS safety.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  filed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  complainant_type TEXT NOT NULL CHECK (complainant_type IN ('driver','customer','employee','external','anonymous')),
  complainant_driver_id UUID REFERENCES mdata.drivers(id),
  complainant_user_id UUID REFERENCES identity.users(id),
  complainant_customer_id UUID REFERENCES mdata.customers(id),
  complainant_external_name TEXT,
  complainant_external_contact TEXT,
  respondent_type TEXT NOT NULL CHECK (respondent_type IN ('driver','employee')),
  respondent_driver_id UUID REFERENCES mdata.drivers(id),
  respondent_user_id UUID REFERENCES identity.users(id),
  complaint_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_doc_ids UUID[],
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed','escalated')),
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES identity.users(id),
  created_by UUID NOT NULL REFERENCES identity.users(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES identity.users(id),
  void_reason TEXT,
  CONSTRAINT chk_complaint_respondent_consistent CHECK (
    (respondent_type = 'driver' AND respondent_driver_id IS NOT NULL AND respondent_user_id IS NULL) OR
    (respondent_type = 'employee' AND respondent_user_id IS NOT NULL AND respondent_driver_id IS NULL)
  ),
  CONSTRAINT chk_complaint_complainant_consistent CHECK (
    (complainant_type = 'driver' AND complainant_driver_id IS NOT NULL) OR
    (complainant_type = 'employee' AND complainant_user_id IS NOT NULL) OR
    (complainant_type = 'customer' AND complainant_customer_id IS NOT NULL) OR
    (complainant_type = 'external' AND complainant_external_name IS NOT NULL) OR
    (complainant_type = 'anonymous')
  )
);
ALTER TABLE safety.complaints
  ADD COLUMN IF NOT EXISTS filed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS complainant_driver_id UUID REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS complainant_user_id UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS complainant_customer_id UUID REFERENCES mdata.customers(id),
  ADD COLUMN IF NOT EXISTS complainant_external_name TEXT,
  ADD COLUMN IF NOT EXISTS complainant_external_contact TEXT,
  ADD COLUMN IF NOT EXISTS respondent_driver_id UUID REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS respondent_user_id UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS complaint_type TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_complaint_respondent_driver ON safety.complaints(respondent_driver_id) WHERE respondent_driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaint_respondent_user ON safety.complaints(respondent_user_id) WHERE respondent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaint_company_status ON safety.complaints(operating_company_id, status, filed_at DESC);
-- Table 5: safety.integrity_observations
CREATE TABLE IF NOT EXISTS safety.integrity_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  observation_type TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('driver','dispatcher','unit','trailer','customer','vendor','load','wo')),
  subject_id UUID NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','severe')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  observation_data JSONB NOT NULL,
  source_view TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','dismissed','converted_to_action')),
  reviewed_by UUID REFERENCES identity.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_integrity_company_severity ON safety.integrity_observations(operating_company_id, severity, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_integrity_subject ON safety.integrity_observations(subject_type, subject_id);
-- Catalog: complaint_types (7 rows)
WITH seed(code, label, description) AS (
  VALUES
    ('HARASSMENT','Harassment','Verbal, physical, sexual harassment'),
    ('MISCONDUCT','Misconduct','Behavioral or policy violations'),
    ('SERVICE-QUALITY','Service Quality','Service-related complaint from customer'),
    ('COMMUNICATION','Communication','Failed/poor communication with stakeholders'),
    ('SAFETY-CONCERN','Safety Concern','Unsafe practice, behavior, or condition'),
    ('RETALIATION','Retaliation','Adverse action following a prior complaint'),
    ('OTHER','Other','Other complaint (notes required)')
)
INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity)
SELECT c.id, s.code, s.label, 'medium'
FROM org.companies c
CROSS JOIN seed s
ON CONFLICT (operating_company_id, type_code) DO UPDATE
SET type_name = EXCLUDED.type_name,
    is_active = true;
-- INTEGRITY VIEWS (security_invoker=true)
DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW safety.v_wo_cost_outliers
      WITH (security_invoker=true) AS
      WITH avgs AS (
        SELECT source_type, operating_company_id,
          AVG(COALESCE(total_actual_cost, 0)) AS avg_cost,
          STDDEV(COALESCE(total_actual_cost, 0)) AS stddev_cost
        FROM maintenance.work_orders
        WHERE created_at >= now() - interval '90 days'
        GROUP BY source_type, operating_company_id
      )
      SELECT wo.id AS wo_id, wo.operating_company_id, wo.display_id, wo.source_type, wo.unit_id,
        COALESCE(wo.total_actual_cost, 0) AS total_cost_cents, a.avg_cost, a.stddev_cost,
        (COALESCE(wo.total_actual_cost, 0) - a.avg_cost) / NULLIF(a.stddev_cost, 0) AS z_score, wo.created_at
      FROM maintenance.work_orders wo
      JOIN avgs a ON a.source_type = wo.source_type AND a.operating_company_id = wo.operating_company_id
      WHERE COALESCE(wo.total_actual_cost, 0) > a.avg_cost + (2 * a.stddev_cost)
        AND wo.created_at >= now() - interval '30 days'
    $v$;
  ELSE
    EXECUTE $v$
      CREATE OR REPLACE VIEW safety.v_wo_cost_outliers
      WITH (security_invoker=true) AS
      SELECT NULL::uuid AS wo_id, NULL::uuid AS operating_company_id, NULL::text AS display_id, NULL::text AS source_type,
             NULL::uuid AS unit_id, NULL::bigint AS total_cost_cents, NULL::numeric AS avg_cost, NULL::numeric AS stddev_cost,
             NULL::numeric AS z_score, NULL::timestamptz AS created_at
      WHERE false
    $v$;
  END IF;
END
$$;
CREATE OR REPLACE VIEW safety.v_fuel_mpg_anomalies
WITH (security_invoker=true) AS
SELECT di.id AS fuel_expense_id, di.operating_company_id, di.unit_id, di.driver_id,
  di.inspection_date AS transaction_date, NULL::numeric AS gallons, NULL::numeric AS computed_mpg,
  CASE WHEN di.csa_points > 50 THEN 'too_low'
       WHEN di.csa_points < 1 THEN 'too_high' END AS anomaly_type
FROM safety.dot_inspections di
WHERE di.inspection_date >= now() - interval '60 days'
  AND (di.csa_points > 50 OR di.csa_points < 1);
CREATE OR REPLACE VIEW safety.v_driver_dwell_outliers
WITH (security_invoker=true) AS
WITH driver_dwell AS (
  SELECT hv.driver_id, hv.operating_company_id,
    AVG(COALESCE(hv.duration_minutes, 0)) AS avg_dwell_minutes
  FROM safety.hos_violations hv
  WHERE hv.occurred_at >= now() - interval '30 days'
  GROUP BY hv.driver_id, hv.operating_company_id
),
fleet_avg AS (
  SELECT operating_company_id, AVG(avg_dwell_minutes) AS fleet_avg_minutes
  FROM driver_dwell GROUP BY operating_company_id
)
SELECT dd.driver_id, dd.operating_company_id, dd.avg_dwell_minutes, fa.fleet_avg_minutes,
  (dd.avg_dwell_minutes - fa.fleet_avg_minutes) AS minutes_over_avg
FROM driver_dwell dd
JOIN fleet_avg fa ON fa.operating_company_id = dd.operating_company_id
WHERE dd.avg_dwell_minutes > fa.fleet_avg_minutes + 120;
CREATE OR REPLACE VIEW safety.v_hos_pattern_breaks
WITH (security_invoker=true) AS
SELECT hv.driver_id, hv.operating_company_id,
  COUNT(*) AS violations_30d,
  MAX(hv.occurred_at) AS most_recent_violation,
  ARRAY_AGG(DISTINCT hv.violation_type) AS violation_types
FROM safety.hos_violations hv
WHERE hv.occurred_at >= now() - interval '30 days' AND hv.voided_at IS NULL
GROUP BY hv.driver_id, hv.operating_company_id
HAVING COUNT(*) >= 3;
-- AUDIT EVENT REGISTRATION (13 new types)
CREATE TABLE IF NOT EXISTS catalogs.audit_event_types (
  code text PRIMARY KEY,
  description text NOT NULL,
  severity_default text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO catalogs.audit_event_types (code, description, severity_default) VALUES
  ('safety.hos_violation.created','HOS violation logged','warning'),
  ('safety.hos_violation.voided','HOS violation voided','info'),
  ('safety.dot_inspection.created','DOT inspection recorded','info'),
  ('safety.dot_inspection.oos_spawned_wo','OOS DOT inspection auto-spawned WO','severe'),
  ('safety.dot_inspection.voided','DOT inspection voided','info'),
  ('safety.csa_score.computed','CSA score computed','info'),
  ('safety.csa_score.fmcsa_pulled','CSA score pulled from FMCSA SAFER','info'),
  ('safety.complaint.filed','Complaint filed','warning'),
  ('safety.complaint.status_changed','Complaint status changed','info'),
  ('safety.complaint.resolved','Complaint resolved','info'),
  ('safety.complaint.voided','Complaint voided','warning'),
  ('safety.integrity.observation_created','Integrity observation created','info'),
  ('safety.integrity.observation_reviewed','Integrity observation reviewed','info')
ON CONFLICT (code) DO NOTHING;

-- ===== From 0052_p3_t11_12_factoring_detail.sql =====
DROP VIEW IF EXISTS views.factoring_statements_settings;
DROP VIEW IF EXISTS views.factoring_chargebacks_fees;
DROP VIEW IF EXISTS views.factoring_recourse_at_risk;
DROP VIEW IF EXISTS views.factoring_summary;

-- ===== From 0053_p3_t11_13_form_425c.sql =====
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE TABLE IF NOT EXISTS compliance.form_425c_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reporting_month date NOT NULL,
  case_number text NOT NULL,
  court_district text NOT NULL,
  subchapter text NOT NULL CHECK (subchapter IN ('V', 'standard')),
  petition_date date NOT NULL,
  part1_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  part2_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_19_opening_cash numeric(12,2),
  line_20_receipts numeric(12,2),
  line_21_disbursements numeric(12,2),
  line_22_net_cash_flow numeric(12,2),
  line_23_ending_cash numeric(12,2),
  banking_imported_at timestamptz,
  banking_imported_by_user_id uuid REFERENCES identity.users(id),
  line_24_payables numeric(12,2),
  line_25_receivables numeric(12,2),
  line_26_employees_at_filing int,
  line_27_employees_now int,
  line_28_bk_fees_this_month numeric(12,2),
  line_29_bk_fees_since_filing numeric(12,2),
  line_30_other_fees_this_month numeric(12,2),
  line_31_other_fees_since_filing numeric(12,2),
  line_32_proj_receipts numeric(12,2),
  line_33_proj_disbursements numeric(12,2),
  line_34_proj_net_cash_flow numeric(12,2),
  line_35_next_proj_receipts numeric(12,2),
  line_36_next_proj_disbursements numeric(12,2),
  line_37_next_proj_net_cash_flow numeric(12,2),
  attachment_38_bank_statements_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_39_recon_reports_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_40_financial_reports_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_41_budget_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachment_42_job_costing_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL CHECK (status IN ('draft', 'ready_to_file', 'filed', 'amended')) DEFAULT 'draft',
  filed_pdf_uuid uuid REFERENCES docs.files(id),
  filed_at timestamptz,
  filed_by_user_id uuid REFERENCES identity.users(id),
  amended_from_uuid uuid REFERENCES compliance.form_425c_reports(id),
  carry_forward_source_report_id uuid REFERENCES compliance.form_425c_reports(id),
  projection_override_reason text,
  projection_override_by_user_id uuid REFERENCES identity.users(id),
  projection_override_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reporting_month, status) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_form_425c_reports_company_month
  ON compliance.form_425c_reports (operating_company_id, reporting_month DESC);
CREATE INDEX IF NOT EXISTS idx_form_425c_reports_status
  ON compliance.form_425c_reports (operating_company_id, status, reporting_month DESC);
CREATE INDEX IF NOT EXISTS idx_form_425c_reports_amended_from
  ON compliance.form_425c_reports (amended_from_uuid)
  WHERE amended_from_uuid IS NOT NULL;
CREATE TABLE IF NOT EXISTS compliance.form_425c_exhibit_a_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES compliance.form_425c_reports(id) ON DELETE CASCADE,
  line_number int NOT NULL CHECK (line_number BETWEEN 1 AND 9),
  explanation text NOT NULL CHECK (length(trim(explanation)) >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_425c_exhibit_a_report
  ON compliance.form_425c_exhibit_a_entries (report_id, line_number, created_at DESC);
CREATE TABLE IF NOT EXISTS compliance.form_425c_exhibit_b_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES compliance.form_425c_reports(id) ON DELETE CASCADE,
  line_number int NOT NULL CHECK (line_number BETWEEN 10 AND 18),
  explanation text NOT NULL CHECK (length(trim(explanation)) >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_425c_exhibit_b_report
  ON compliance.form_425c_exhibit_b_entries (report_id, line_number, created_at DESC);
DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class, severity_default)
    VALUES
      ('compliance.form_425c.created', 'info'),
      ('compliance.form_425c.draft_saved', 'info'),
      ('compliance.form_425c.banking_imported', 'info'),
      ('compliance.form_425c.pdf_generated', 'info'),
      ('compliance.form_425c.filed', 'info'),
      ('compliance.form_425c.amended', 'info')
    ON CONFLICT (event_class) DO NOTHING;
  END IF;
END
$$;

-- ===== From 0054_p3_t11_13_form_425c_profiles.sql =====
CREATE TABLE IF NOT EXISTS catalogs.form_425c_company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  company_key text NOT NULL CHECK (company_key IN ('trucking', 'transportation')),
  company_name text NOT NULL,
  case_number text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT 'Texas',
  division text NOT NULL DEFAULT 'San Antonio',
  judge text NOT NULL DEFAULT '',
  ein text NOT NULL DEFAULT '',
  filing_address text NOT NULL DEFAULT '',
  line_of_business text NOT NULL DEFAULT '',
  naisc_code text NOT NULL DEFAULT '',
  default_questionnaire_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, company_key)
);
CREATE INDEX IF NOT EXISTS idx_form_425c_profiles_company_key
  ON catalogs.form_425c_company_profiles (operating_company_id, company_key);
DROP TRIGGER IF EXISTS trg_form_425c_profiles_updated_at ON catalogs.form_425c_company_profiles;

-- ===== From 0055_p3_t11_14_lists_hub.sql =====
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE TABLE IF NOT EXISTS accounting.qbo_remote_counts (
  entity_key text PRIMARY KEY,
  count_value int NOT NULL,
  last_polled_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  EXECUTE $VIEW$
    CREATE OR REPLACE VIEW views.catalogs_inventory
    WITH (security_invoker = true) AS
    SELECT 'safety'::text AS domain, 'incident_types'::text AS catalog_key, 'Incident Types'::text AS display_name, COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.incident_types'), 0)::int AS row_count
    UNION ALL SELECT 'safety', 'injury_severity_levels', 'Injury Severity Levels', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.injury_severity_levels'), 0)::int
    UNION ALL SELECT 'safety', 'drug_test_types', 'Drug Test Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.drug_test_types'), 0)::int
    UNION ALL SELECT 'safety', 'drug_test_results', 'Drug Test Results', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.drug_test_results'), 0)::int
    UNION ALL SELECT 'safety', 'csa_basic_categories', 'CSA BASIC Categories', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.csa_basic_categories'), 0)::int
    UNION ALL SELECT 'safety', 'hos_violation_types', 'HOS Violation Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.hos_violation_types'), 0)::int
    UNION ALL SELECT 'safety', 'safety_event_statuses', 'Safety Event Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.safety_event_statuses'), 0)::int
    UNION ALL SELECT 'safety', 'company_violation_types', 'Company Violation Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.company_violation_types'), 0)::int
    UNION ALL SELECT 'maintenance', 'work_order_types', 'Work Order Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.work_order_types'), 0)::int
    UNION ALL SELECT 'maintenance', 'work_order_statuses', 'Work Order Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.work_order_statuses'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_priority_levels', 'Maintenance Priority Levels', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_priority_levels'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_vendors', 'Maintenance Vendors', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_vendors'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_failure_codes', 'Maintenance Failure Codes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_failure_codes'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_service_tasks', 'Maintenance Service Tasks', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_service_tasks'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_parts', 'Maintenance Parts', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_parts'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_labor_codes', 'Maintenance Labor Codes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_labor_codes'), 0)::int
    UNION ALL SELECT 'maintenance', 'maintenance_shop_locations', 'Maintenance Shop Locations', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.maintenance_shop_locations'), 0)::int
    UNION ALL SELECT 'dispatch', 'load_statuses', 'Load Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.load_statuses'), 0)::int
    UNION ALL SELECT 'dispatch', 'stop_types', 'Stop Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.stop_types'), 0)::int
    UNION ALL SELECT 'dispatch', 'trailer_types', 'Trailer Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.trailer_types'), 0)::int
    UNION ALL SELECT 'dispatch', 'lane_profiles', 'Lane Profiles', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.lane_profiles'), 0)::int
    UNION ALL SELECT 'dispatch', 'border_routing_profiles', 'Border Routing Profiles', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.border_routing_profiles'), 0)::int
    UNION ALL SELECT 'dispatch', 'detention_reasons', 'Detention Reasons', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.detention_reasons'), 0)::int
    UNION ALL SELECT 'dispatch', 'cancellation_reasons', 'Cancellation Reasons', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.cancellation_reasons'), 0)::int
    UNION ALL SELECT 'dispatch', 'dispatch_flag_colors', 'Dispatch Flag Colors', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.dispatch_flag_colors'), 0)::int
    UNION ALL SELECT 'dispatch', 'route_risk_levels', 'Route Risk Levels', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.route_risk_levels'), 0)::int
    UNION ALL SELECT 'dispatch', 'appointment_statuses', 'Appointment Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.appointment_statuses'), 0)::int
    UNION ALL SELECT 'dispatch', 'in_transit_issue_types', 'In-Transit Issue Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.in_transit_issue_types'), 0)::int
    UNION ALL SELECT 'fuel', 'fuel_station_brands', 'Fuel Station Brands', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.fuel_station_brands'), 0)::int
    UNION ALL SELECT 'fuel', 'fuel_card_types', 'Fuel Card Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.fuel_card_types'), 0)::int
    UNION ALL SELECT 'fuel', 'expensive_states', 'Expensive States', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.expensive_states'), 0)::int
    UNION ALL SELECT 'fuel', 'fuel_tax_jurisdictions', 'Fuel Tax Jurisdictions', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.fuel_tax_jurisdictions'), 0)::int
    UNION ALL SELECT 'fuel', 'fuel_stop_reason_codes', 'Fuel Stop Reason Codes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.fuel_stop_reason_codes'), 0)::int
    UNION ALL SELECT 'fuel', 'mpg_bands', 'MPG Bands', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.mpg_bands'), 0)::int
    UNION ALL SELECT 'fuel', 'fuel_exception_types', 'Fuel Exception Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.fuel_exception_types'), 0)::int
    UNION ALL SELECT 'drivers', 'driver_pay_codes', 'Driver Pay Codes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.driver_pay_codes'), 0)::int
    UNION ALL SELECT 'drivers', 'driver_deduction_codes', 'Driver Deduction Codes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.driver_deduction_codes'), 0)::int
    UNION ALL SELECT 'drivers', 'driver_statuses', 'Driver Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.driver_statuses'), 0)::int
    UNION ALL SELECT 'drivers', 'endorsement_types', 'Endorsement Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.endorsement_types'), 0)::int
    UNION ALL SELECT 'drivers', 'driver_event_types', 'Driver Event Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.driver_event_types'), 0)::int
    UNION ALL SELECT 'drivers', 'settlement_statuses', 'Settlement Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.settlement_statuses'), 0)::int
    UNION ALL SELECT 'drivers', 'liability_types', 'Liability Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.liability_types'), 0)::int
    UNION ALL SELECT 'drivers', 'cash_advance_statuses', 'Cash Advance Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.cash_advance_statuses'), 0)::int
    UNION ALL SELECT 'fleet', 'equipment_types', 'Equipment Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.equipment_types'), 0)::int
    UNION ALL SELECT 'fleet', 'tractor_statuses', 'Tractor Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.tractor_statuses'), 0)::int
    UNION ALL SELECT 'fleet', 'trailer_statuses', 'Trailer Statuses', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.trailer_statuses'), 0)::int
    UNION ALL SELECT 'fleet', 'unit_ownership_types', 'Unit Ownership Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.unit_ownership_types'), 0)::int
    UNION ALL SELECT 'fleet', 'tire_positions', 'Tire Positions', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.tire_positions'), 0)::int
    UNION ALL SELECT 'fleet', 'asset_condition_codes', 'Asset Condition Codes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.asset_condition_codes'), 0)::int
    UNION ALL SELECT 'accounting', 'chart_of_accounts', 'Chart of Accounts', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.chart_of_accounts'), 0)::int
    UNION ALL SELECT 'accounting', 'classes', 'Classes', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.classes'), 0)::int
    UNION ALL SELECT 'accounting', 'items', 'Items', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.items'), 0)::int
    UNION ALL SELECT 'accounting', 'payment_terms', 'Payment Terms', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.payment_terms'), 0)::int
    UNION ALL SELECT 'accounting', 'posting_templates', 'Posting Templates', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.posting_templates'), 0)::int
    UNION ALL SELECT 'accounting', 'account_role_bindings', 'Account Role Bindings', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.account_role_bindings'), 0)::int
    UNION ALL SELECT 'accounting', 'vendor_types', 'Vendor Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.vendor_types'), 0)::int
    UNION ALL SELECT 'accounting', 'customer_terms', 'Customer Terms', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.customer_terms'), 0)::int
    UNION ALL SELECT 'accounting', 'journal_entry_types', 'Journal Entry Types', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.journal_entry_types'), 0)::int
    UNION ALL SELECT 'accounting', 'qbo_categories', 'QBO Categories', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'catalog.qbo_categories'), 0)::int
    UNION ALL SELECT 'names_master', 'names_master', 'Names Master', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'view.names_master'), 0)::int
    UNION ALL SELECT 'names_master', 'names_drivers', 'Names · Drivers', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'view.names_drivers'), 0)::int
    UNION ALL SELECT 'names_master', 'names_vendors', 'Names · Vendors', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'view.names_vendors'), 0)::int
    UNION ALL SELECT 'names_master', 'names_customers', 'Names · Customers', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'view.names_customers'), 0)::int
    UNION ALL SELECT 'names_master', 'names_dispatch_contacts', 'Names · Dispatch Contacts', COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'view.names_dispatch_contacts'), 0)::int
  $VIEW$;
END
$$;
DO $$
BEGIN
  IF to_regclass('audit.audit_events') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.catalogs_recent_activity
      WITH (security_invoker = true) AS
      SELECT
        a.created_at,
        a.event_class AS event_type,
        COALESCE(a.payload->>'catalog', a.payload->>'catalog_key', 'unknown') AS catalog_key,
        COALESCE(a.payload->>'action', 'updated') AS action,
        COALESCE(a.payload->>'entity_name', a.payload->>'name', a.payload->>'code', '-') AS entity_name,
        COALESCE(u.email, 'system') AS user_display_name,
        COALESCE(a.payload->>'qbo_sync_status', 'pending') AS qbo_sync_status
      FROM audit.audit_events a
      LEFT JOIN identity.users u ON u.id = a.actor_user_uuid
      WHERE a.event_class LIKE 'catalog.%'
         OR a.event_class LIKE 'catalogs.%'
      ORDER BY a.created_at DESC
      LIMIT 50
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.catalogs_recent_activity
      WITH (security_invoker = true) AS
      SELECT
        NULL::timestamptz AS created_at,
        NULL::text AS event_type,
        NULL::text AS catalog_key,
        NULL::text AS action,
        NULL::text AS entity_name,
        NULL::text AS user_display_name,
        NULL::text AS qbo_sync_status
      WHERE false
    $EMPTY$;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('outbox.queue') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.qbo_sync_health
      WITH (security_invoker = true) AS
      WITH entities(entity) AS (
        VALUES
          ('vendors'::text),
          ('customers'),
          ('classes'),
          ('items'),
          ('bank_accounts'),
          ('chart_of_accounts'),
          ('qbo_categories'),
          ('names_master')
      )
      SELECT
        e.entity,
        CASE
          WHEN e.entity = 'names_master' THEN COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'local.names_master'), 0)
          ELSE COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'local.' || e.entity), 0)
        END::int AS local_count,
        CASE
          WHEN e.entity = 'names_master' THEN NULL::int
          ELSE COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'qbo.' || e.entity), 0)
        END::int AS qbo_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM outbox.queue q
          WHERE q.target_system = 'qbo'
            AND q.entity_type = e.entity
            AND q.status IN ('pending', 'failed', 'in_flight')
        ), 0)::int AS pending_count,
        CASE
          WHEN e.entity = 'names_master' THEN 'local-only'
          WHEN COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'local.' || e.entity), 0)
             = COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'qbo.' || e.entity), 0)
             AND COALESCE((
               SELECT COUNT(*)::int
               FROM outbox.queue q
               WHERE q.target_system = 'qbo'
                 AND q.entity_type = e.entity
                 AND q.status IN ('pending', 'failed', 'in_flight')
             ), 0) = 0
            THEN '0'
          WHEN COALESCE((
               SELECT COUNT(*)::int
               FROM outbox.queue q
               WHERE q.target_system = 'qbo'
                 AND q.entity_type = e.entity
                 AND q.status IN ('pending', 'failed', 'in_flight')
             ), 0) > 0
            THEN COALESCE((
               SELECT COUNT(*)::int
               FROM outbox.queue q
               WHERE q.target_system = 'qbo'
                 AND q.entity_type = e.entity
                 AND q.status IN ('pending', 'failed', 'in_flight')
             ), 0)::text || ' pend'
          ELSE abs(
            COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'local.' || e.entity), 0)
            - COALESCE((SELECT count_value FROM accounting.qbo_remote_counts WHERE entity_key = 'qbo.' || e.entity), 0)
          )::text || ' drift'
        END AS drift
      FROM entities e
      ORDER BY e.entity
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.qbo_sync_health
      WITH (security_invoker = true) AS
      SELECT
        NULL::text AS entity,
        0::int AS local_count,
        0::int AS qbo_count,
        0::int AS pending_count,
        NULL::text AS drift
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

-- ===== From 0056_p3_t11_15_4_driver_pwa_backend.sql =====
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

-- ===== From 0057_p3_t11_15_6_email_login_and_uniqueness.sql =====
CREATE TABLE IF NOT EXISTS identity.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address inet
);
CREATE INDEX IF NOT EXISTS idx_email_verifs_lookup
  ON identity.email_verifications(email, code, expires_at)
  WHERE consumed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON identity.users(lower(email))
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON identity.users(phone)
  WHERE phone IS NOT NULL;

-- ===== From 0058_p3_t11_16_1_reports_infrastructure.sql =====
CREATE SCHEMA IF NOT EXISTS reports;
CREATE TABLE IF NOT EXISTS reports.run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  report_id text NOT NULL,
  report_name text NOT NULL,
  user_id uuid NOT NULL REFERENCES identity.users(id),
  user_role text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  duration_ms int,
  rows_returned int,
  run_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_run_log_recent ON reports.run_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_log_report ON reports.run_log(report_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_log_company ON reports.run_log(operating_company_id);
CREATE TABLE IF NOT EXISTS reports.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  report_id text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','quarterly')),
  cadence_detail text,
  recipient_roles text[] NOT NULL DEFAULT '{}',
  recipient_emails text[] NOT NULL DEFAULT '{}',
  last_sent_at timestamptz,
  next_due_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_company ON reports.scheduled_reports(operating_company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON reports.scheduled_reports(next_due_at) WHERE enabled = true;
INSERT INTO reports.scheduled_reports
  (operating_company_id, report_id, cadence, cadence_detail, recipient_roles)
SELECT c.id, r.report_id, r.cadence, r.cadence_detail, r.recipient_roles
FROM org.companies c, (VALUES
  ('dispatch-board',        'daily',     'Mon-Sun 7:00am',      ARRAY['Owner']::text[]),
  ('cash-position-ar',      'daily',     'Mon-Sun 6:00pm',      ARRAY['Owner','Accountant']::text[]),
  ('profit-per-truck-week', 'weekly',    'Mon 8:00am',          ARRAY['Owner']::text[]),
  ('settlements-ready',     'weekly',    'Fri 5:00pm',          ARRAY['Accountant']::text[]),
  ('maintenance-open-wos',  'weekly',    'Mon 8:00am',          ARRAY['Safety']::text[]),
  ('ifta-quarterly-state',  'quarterly', 'last day of quarter', ARRAY['Safety']::text[])
) AS r(report_id, cadence, cadence_detail, recipient_roles)
ON CONFLICT DO NOTHING;

-- ===== From 0059_p3_t11_17_7_customer_lanes.sql =====
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

-- ===== From 0060_p3_t11_20_1_accounting_invoices_schema.sql =====
CREATE SCHEMA IF NOT EXISTS accounting;
-- ============================================================
-- ACCOUNTING.INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  display_id text NOT NULL CHECK (display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'void', 'factored')),

  source_load_id uuid REFERENCES mdata.loads(id),

  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  delivery_date date,
  sent_at timestamptz,
  voided_at timestamptz,
  void_reason text,

  subtotal_cents bigint NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  amount_paid_cents bigint NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  amount_open_cents bigint GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED,
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code IN ('USD', 'MXN')),

  payment_terms_id uuid REFERENCES catalogs.payment_terms(id),
  payment_terms_label text,
  payment_terms_days int CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),

  ar_email_snapshot text,
  ar_phone_snapshot text,

  internal_notes text,
  customer_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id),

  UNIQUE (operating_company_id, display_id),
  CHECK (amount_paid_cents <= total_cents)
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON accounting.invoices(customer_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_open
  ON accounting.invoices(operating_company_id, due_date)
  WHERE status IN ('sent', 'partial');
CREATE INDEX IF NOT EXISTS idx_invoices_load ON accounting.invoices(source_load_id);
-- ============================================================
-- ACCOUNTING.INVOICE_LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE,
  source_load_id uuid REFERENCES mdata.loads(id),
  line_type text NOT NULL CHECK (
    line_type IN ('linehaul', 'fsc', 'detention', 'layover', 'lumper', 'tonu', 'accessorial', 'tax', 'adjustment', 'other')
  ),
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents bigint NOT NULL CHECK (unit_amount_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  qbo_class_snapshot text,
  qbo_item_id text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON accounting.invoice_lines(invoice_id, display_order);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_load ON accounting.invoice_lines(source_load_id);
-- ============================================================
-- ACCOUNTING.PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  display_id text NOT NULL CHECK (display_id ~ '^PMT-[0-9]{4}-[0-9]{5}$'),
  payment_method text NOT NULL CHECK (
    payment_method IN ('ach', 'wire', 'check', 'cash', 'factoring_advance', 'factoring_reserve', 'credit_card', 'other')
  ),
  payment_date date NOT NULL,
  reference text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_applied_cents bigint NOT NULL DEFAULT 0 CHECK (amount_applied_cents >= 0),
  amount_unapplied_cents bigint GENERATED ALWAYS AS (amount_cents - amount_applied_cents) STORED,
  deposited_to_account_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  UNIQUE (operating_company_id, display_id),
  CHECK (amount_applied_cents <= amount_cents)
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON accounting.payments(customer_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_unapplied
  ON accounting.payments(operating_company_id)
  WHERE amount_unapplied_cents > 0 AND voided_at IS NULL;
-- ============================================================
-- ACCOUNTING.PAYMENT_APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  payment_id uuid NOT NULL REFERENCES accounting.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by_user_id uuid REFERENCES identity.users(id),
  UNIQUE (payment_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_pmt_apps_invoice ON accounting.payment_applications(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pmt_apps_payment ON accounting.payment_applications(payment_id);
-- ============================================================
-- ACCOUNTING.CREDIT_MEMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  related_invoice_id uuid REFERENCES accounting.invoices(id),
  display_id text NOT NULL CHECK (display_id ~ '^CM-[0-9]{4}-[0-9]{4}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'applied', 'voided')),
  reason text NOT NULL CHECK (reason IN ('damage', 'shortage', 'rate_dispute', 'duplicate_billing', 'detention_dispute', 'other')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_applied_cents bigint NOT NULL DEFAULT 0 CHECK (amount_applied_cents >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  UNIQUE (operating_company_id, display_id),
  CHECK (amount_applied_cents <= amount_cents)
);
CREATE INDEX IF NOT EXISTS idx_credit_memos_customer ON accounting.credit_memos(customer_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_memos_invoice ON accounting.credit_memos(related_invoice_id);
-- ============================================================
-- VIEWS.AR_AGING
-- ============================================================
CREATE OR REPLACE VIEW views.ar_aging
WITH (security_invoker = true)
AS
SELECT
  i.operating_company_id,
  i.customer_id,
  c.customer_name AS customer_name,
  COUNT(*) FILTER (WHERE i.amount_open_cents > 0) AS open_invoice_count,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date >= CURRENT_DATE), 0) AS current_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE AND i.due_date >= CURRENT_DATE - 30), 0) AS bucket_1_30_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE - 30 AND i.due_date >= CURRENT_DATE - 60), 0) AS bucket_31_60_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE - 60 AND i.due_date >= CURRENT_DATE - 90), 0) AS bucket_61_90_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE - 90), 0) AS bucket_91_plus_cents,
  COALESCE(SUM(i.amount_open_cents), 0) AS total_open_cents
FROM accounting.invoices i
JOIN mdata.customers c ON c.id = i.customer_id
WHERE i.status IN ('sent', 'partial')
  AND i.voided_at IS NULL
GROUP BY i.operating_company_id, i.customer_id, c.customer_name;
-- ============================================================
-- TRIGGERS: payment applications keep invoice/payment totals synced
-- ============================================================
CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
  v_new_invoice_id uuid := NULL;
  v_old_invoice_id uuid := NULL;
  v_paid bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_invoice_id := NEW.invoice_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_invoice_id := OLD.invoice_id;
  END IF;

  FOR v_invoice_id IN
    SELECT DISTINCT x.invoice_id
    FROM (VALUES (v_new_invoice_id), (v_old_invoice_id)) AS x(invoice_id)
    WHERE x.invoice_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_paid
    FROM accounting.payment_applications
    WHERE invoice_id = v_invoice_id;

    UPDATE accounting.invoices i
    SET
      amount_paid_cents = v_paid,
      status = CASE
        WHEN i.status = 'void' THEN 'void'
        WHEN i.status = 'factored' THEN 'factored'
        WHEN v_paid >= i.total_cents AND i.total_cents > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        WHEN i.status IN ('partial', 'paid') THEN 'sent'
        ELSE i.status
      END,
      updated_at = now()
    WHERE i.id = v_invoice_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS pmt_app_recompute_invoice ON accounting.payment_applications;
CREATE OR REPLACE FUNCTION accounting.recompute_payment_applied()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id uuid;
  v_new_payment_id uuid := NULL;
  v_old_payment_id uuid := NULL;
  v_applied bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_payment_id := NEW.payment_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_payment_id := OLD.payment_id;
  END IF;

  FOR v_payment_id IN
    SELECT DISTINCT x.payment_id
    FROM (VALUES (v_new_payment_id), (v_old_payment_id)) AS x(payment_id)
    WHERE x.payment_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_applied
    FROM accounting.payment_applications
    WHERE payment_id = v_payment_id;

    UPDATE accounting.payments p
    SET amount_applied_cents = v_applied
    WHERE p.id = v_payment_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS pmt_app_recompute_payment ON accounting.payment_applications;

-- ===== From 0061_p3_t11_20_5_factoring_tracking.sql =====
CREATE SCHEMA IF NOT EXISTS accounting;
-- ============================================================
-- ACCOUNTING.INVOICES extension — factoring linkage
-- ============================================================
ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS factoring_advance_id uuid,
  ADD COLUMN IF NOT EXISTS factoring_status text
    CHECK (
      factoring_status IN (
        'not_factored',
        'submitted',
        'advanced',
        'reserve_held',
        'collected',
        'released',
        'recourse_returned'
      )
    ) DEFAULT 'not_factored';
CREATE INDEX IF NOT EXISTS idx_invoices_factoring_status
  ON accounting.invoices (factoring_status)
  WHERE factoring_status NOT IN ('not_factored', 'released');
-- ============================================================
-- ACCOUNTING.FACTORING_ADVANCES (one row per factoring submission)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.factoring_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  factoring_company_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id) ON DELETE RESTRICT,
  display_id text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (
      status IN (
        'submitted',
        'advanced',
        'reserve_held',
        'collected',
        'released',
        'recourse_returned',
        'disputed',
        'voided'
      )
    ),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submission_batch_ref text,
  invoice_total_cents bigint NOT NULL CHECK (invoice_total_cents >= 0),
  advance_rate_pct numeric(5,2) NOT NULL CHECK (advance_rate_pct >= 0 AND advance_rate_pct <= 100),
  advance_amount_cents bigint NOT NULL CHECK (advance_amount_cents >= 0),
  reserve_pct numeric(5,2) NOT NULL CHECK (reserve_pct >= 0 AND reserve_pct <= 100),
  reserve_amount_cents bigint NOT NULL CHECK (reserve_amount_cents >= 0),
  factor_fee_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (factor_fee_pct >= 0 AND factor_fee_pct <= 100),
  factor_fee_cents bigint NOT NULL DEFAULT 0 CHECK (factor_fee_cents >= 0),
  release_amount_cents bigint NOT NULL DEFAULT 0 CHECK (release_amount_cents >= 0),
  advanced_at timestamptz,
  collected_at timestamptz,
  released_at timestamptz,
  recourse_returned_at timestamptz,
  recourse_reason text,
  notes text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  UNIQUE (operating_company_id, display_id)
);
CREATE INDEX IF NOT EXISTS idx_factoring_advances_status
  ON accounting.factoring_advances (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_factoring_advances_vendor
  ON accounting.factoring_advances (factoring_company_vendor_id);
-- ============================================================
-- VIEWS.FACTORING_SUMMARY
-- Keep legacy columns used by factoring module while sourcing
-- values from the real factoring advances table.
-- ============================================================
CREATE OR REPLACE VIEW views.factoring_summary
WITH (security_invoker = true)
AS
WITH by_vendor AS (
  SELECT
    fa.operating_company_id,
    fa.factoring_company_vendor_id,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status <> 'voided')::int AS total_advances,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'reserve_held')::int AS reserves_pending,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'released')::int AS reserves_released,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'recourse_returned')::int AS recourse_returns,
    COALESCE(SUM(fa.advance_amount_cents) FILTER (WHERE fa.status <> 'voided'), 0)::bigint AS advanced_total_cents,
    COALESCE(SUM(fa.reserve_amount_cents) FILTER (WHERE fa.status IN ('reserve_held', 'collected')), 0)::bigint AS reserve_pending_cents,
    COALESCE(SUM(fa.release_amount_cents) FILTER (WHERE fa.status = 'released'), 0)::bigint AS released_total_cents,
    COALESCE(SUM(fa.factor_fee_cents) FILTER (WHERE fa.status IN ('released', 'recourse_returned')), 0)::bigint AS factor_fees_total_cents,
    COUNT(DISTINCT i.id)::int AS factored_invoice_count,
    MAX(fa.advanced_at) AS last_advance_at
  FROM accounting.factoring_advances fa
  LEFT JOIN accounting.invoices i ON i.factoring_advance_id = fa.id
  WHERE fa.status <> 'voided'
  GROUP BY fa.operating_company_id, fa.factoring_company_vendor_id
),
active_vendor AS (
  SELECT DISTINCT ON (bv.operating_company_id)
    bv.operating_company_id,
    bv.factoring_company_vendor_id AS active_factor_id,
    v.vendor_name AS active_factor_name,
    bv.last_advance_at
  FROM by_vendor bv
  LEFT JOIN mdata.vendors v ON v.id = bv.factoring_company_vendor_id
  ORDER BY bv.operating_company_id, bv.last_advance_at DESC NULLS LAST, bv.factoring_company_vendor_id
),
rollup AS (
  SELECT
    bv.operating_company_id,
    COUNT(DISTINCT bv.factoring_company_vendor_id)::int AS active_factor_count,
    COALESCE(SUM(bv.advanced_total_cents), 0)::bigint AS mtd_advanced_total,
    COALESCE(SUM(bv.total_advances), 0)::int AS mtd_advances_count,
    COALESCE(SUM(bv.reserve_pending_cents), 0)::bigint AS reserve_balance
  FROM by_vendor bv
  GROUP BY bv.operating_company_id
)
SELECT
  bv.operating_company_id,
  av.active_factor_id,
  COALESCE(av.active_factor_name, 'Factoring')::text AS active_factor_name,
  90::int AS recourse_days,
  COALESCE(r.reserve_balance, 0)::numeric AS reserve_balance,
  0::numeric AS chargeback_balance,
  av.last_advance_at,
  COALESCE(r.active_factor_count, 0)::int AS active_factor_count,
  (COALESCE(r.active_factor_count, 0) <= 1) AS single_factor_invariant_ok,
  COALESCE(r.mtd_advances_count, 0)::int AS mtd_advances_count,
  COALESCE(r.mtd_advanced_total, 0)::numeric AS mtd_advanced_total,
  bv.factoring_company_vendor_id,
  bv.total_advances,
  bv.reserves_pending,
  bv.reserves_released,
  bv.recourse_returns,
  bv.advanced_total_cents,
  bv.reserve_pending_cents,
  bv.released_total_cents,
  bv.factor_fees_total_cents,
  bv.factored_invoice_count
FROM by_vendor bv
LEFT JOIN active_vendor av ON av.operating_company_id = bv.operating_company_id
LEFT JOIN rollup r ON r.operating_company_id = bv.operating_company_id;

-- ===== From 0062_p3_t11_21_0_catalog_seed_data.sql =====
-- ============================================================
-- Helper: generic company-scoped catalog seeder
-- ============================================================
CREATE OR REPLACE FUNCTION catalogs.__seed_company_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_rows int := 0;
  sql text;
BEGIN
  sql := format(
    $SQL$
      WITH cos AS (
        SELECT id
        FROM org.companies
        WHERE deactivated_at IS NULL
      )
      INSERT INTO catalogs.%I
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      SELECT
        cos.id,
        x.code,
        x.display_name,
        x.description,
        COALESCE(x.metadata, '{}'::jsonb),
        true,
        x.sort_order
      FROM cos
      CROSS JOIN jsonb_to_recordset($1) AS x(
        code text,
        display_name text,
        description text,
        metadata jsonb,
        sort_order int
      )
      ON CONFLICT DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RAISE NOTICE 'Seeded catalogs.% (% rows inserted)', p_table, inserted_rows;
END
$$;
-- ============================================================
-- Existing catalogs with table-specific schemas
-- ============================================================
DO $$
DECLARE
  v_count int := 0;
  v_inserted int := 0;
BEGIN
  -- accounts (global, non-company table)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.accounts;
  IF v_count < 25 THEN
    INSERT INTO catalogs.accounts (account_number, account_name, account_type, account_subtype, is_postable, currency_code, notes)
    VALUES
      ('1000', 'Cash - Operating', 'Asset', 'Bank', true, 'USD', 'Generic seeded account'),
      ('1100', 'Accounts Receivable', 'Asset', 'AccountsReceivable', true, 'USD', 'Generic seeded account'),
      ('2000', 'Accounts Payable', 'Liability', 'AccountsPayable', true, 'USD', 'Generic seeded account'),
      ('4100', 'Freight Revenue', 'Income', 'SalesOfProductIncome', true, 'USD', 'Generic seeded account'),
      ('6100', 'Fuel Expense', 'Expense', 'FuelCosts', true, 'USD', 'Generic seeded account')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.accounts (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.accounts (already has % rows)', v_count;
  END IF;

  -- classes (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.classes;
  IF v_count < 25 THEN
    INSERT INTO catalogs.classes (class_name, class_code, notes)
    VALUES
      ('Operations - General', 'OPS', 'Generic seeded class'),
      ('Long Haul', 'LH', 'Generic seeded class'),
      ('Regional', 'REG', 'Generic seeded class'),
      ('Mexico Cross Border', 'MX', 'Generic seeded class'),
      ('Maintenance', 'MNT', 'Generic seeded class')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.classes (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.classes (already has % rows)', v_count;
  END IF;

  -- payment terms (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.payment_terms;
  IF v_count < 25 THEN
    INSERT INTO catalogs.payment_terms (terms_name, days_until_due, notes)
    VALUES
      ('Net 7', 7, 'Generic seeded terms'),
      ('Net 15', 15, 'Generic seeded terms'),
      ('Net 30', 30, 'Generic seeded terms'),
      ('Net 45', 45, 'Generic seeded terms'),
      ('Due on Receipt', 0, 'Generic seeded terms')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.payment_terms (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.payment_terms (already has % rows)', v_count;
  END IF;

  -- items (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.items;
  IF v_count < 25 THEN
    INSERT INTO catalogs.items (item_name, item_code, item_type, description, unit_price_cents, taxable, notes)
    VALUES
      ('Linehaul Service', 'LINEHAUL', 'Service', 'Generic linehaul service', 100000, false, 'Generic seeded item'),
      ('Fuel Surcharge', 'FSC', 'Service', 'Generic fuel surcharge', 15000, false, 'Generic seeded item'),
      ('Detention Charge', 'DETENTION', 'Service', 'Generic detention charge', 10000, false, 'Generic seeded item'),
      ('Lumper Charge', 'LUMPER', 'Service', 'Generic lumper charge', 8500, false, 'Generic seeded item'),
      ('Layover Charge', 'LAYOVER', 'Service', 'Generic layover charge', 12000, false, 'Generic seeded item')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.items (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.items (already has % rows)', v_count;
  END IF;

  -- equipment_types (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.equipment_types;
  IF v_count < 5 THEN
    INSERT INTO catalogs.equipment_types (code, name, description, is_active, sort_order)
    VALUES
      ('DRY-VAN', 'Dry Van', 'Generic seeded equipment type', true, 10),
      ('REEFER', 'Reefer', 'Generic seeded equipment type', true, 20),
      ('FLATBED', 'Flatbed', 'Generic seeded equipment type', true, 30),
      ('PNEUMATIC', 'Pneumatic', 'Generic seeded equipment type', true, 40),
      ('OVERSIZE', 'Oversize', 'Generic seeded equipment type', true, 50)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.equipment_types (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.equipment_types (already has % rows)', v_count;
  END IF;
END
$$;
DO $$
DECLARE
  v_count int := 0;
  v_inserted int := 0;
BEGIN
  -- internal_fine_reasons (existing schema)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.internal_fine_reasons;
  IF v_count < 15 THEN
    WITH cos AS (
      SELECT id FROM org.companies WHERE deactivated_at IS NULL
    )
    INSERT INTO catalogs.internal_fine_reasons
      (operating_company_id, reason_code, reason_name, default_amount, is_active)
    SELECT cos.id, x.reason_code, x.reason_name, x.default_amount, true
    FROM cos
    CROSS JOIN (VALUES
      ('LATE-DELIVERY', 'Late delivery', 50.00::numeric),
      ('CLEANLINESS', 'Cleanliness issue', 25.00::numeric),
      ('MISSED-BOL', 'Missing BOL/documents', 25.00::numeric),
      ('MISSED-APPT', 'Missed appointment', 100.00::numeric),
      ('GOVERNOR-OVERRIDE', 'Governor override', 150.00::numeric)
    ) AS x(reason_code, reason_name, default_amount)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.internal_fine_reasons (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.internal_fine_reasons (already has % rows)', v_count;
  END IF;

  -- company_violation_types (existing schema)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.company_violation_types;
  IF v_count < 15 THEN
    WITH cos AS (
      SELECT id FROM org.companies WHERE deactivated_at IS NULL
    )
    INSERT INTO catalogs.company_violation_types
      (operating_company_id, type_code, type_name, default_severity, is_active)
    SELECT cos.id, x.type_code, x.type_name, x.default_severity::smallint, true
    FROM cos
    CROSS JOIN (VALUES
      ('DRIVE-WITHOUT-PERMISSION', 'Drive without permission', 8),
      ('PERSONAL-USE-NO-AUTH', 'Personal use without authorization', 6),
      ('UNAUTH-PASSENGER', 'Unauthorized passenger', 5),
      ('HOS-POLICY-VIOLATION', 'HOS policy violation', 7),
      ('GOVERNOR-OVERRIDE', 'Governor override', 9)
    ) AS x(type_code, type_name, default_severity)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.company_violation_types (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.company_violation_types (already has % rows)', v_count;
  END IF;

  -- complaint_types (existing schema)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.complaint_types;
  IF v_count < 15 THEN
    WITH cos AS (
      SELECT id FROM org.companies WHERE deactivated_at IS NULL
    )
    INSERT INTO catalogs.complaint_types
      (operating_company_id, type_code, type_name, default_severity, is_active)
    SELECT cos.id, x.type_code, x.type_name, x.default_severity, true
    FROM cos
    CROSS JOIN (VALUES
      ('WORKPLACE', 'Workplace complaint', 'warning'),
      ('CIVILIAN-ROAD', 'Civilian road complaint', 'warning'),
      ('DRIVER-DRIVER', 'Driver to driver complaint', 'info'),
      ('CUSTOMER', 'Customer complaint', 'warning'),
      ('ANONYMOUS', 'Anonymous complaint', 'info')
    ) AS x(type_code, type_name, default_severity)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.complaint_types (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.complaint_types (already has % rows)', v_count;
  END IF;
END
$$;

-- ===== From 0066_p3_t11_21_5a_maintenance_catalogs.sql =====
CREATE OR REPLACE FUNCTION catalogs.__seed_maintenance_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql text;
BEGIN
  sql := format(
    $SQL$
      WITH cos AS (
        SELECT id
        FROM org.companies
        WHERE deactivated_at IS NULL
      )
      INSERT INTO catalogs.%I
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      SELECT
        cos.id,
        x.code,
        x.display_name,
        x.description,
        COALESCE(x.metadata, '{}'::jsonb),
        true,
        x.sort_order
      FROM cos
      CROSS JOIN jsonb_to_recordset($1) AS x(
        code text,
        display_name text,
        description text,
        metadata jsonb,
        sort_order int
      )
      ON CONFLICT DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
END
$$;

-- ===== From 0067_p3_t11_21_6a_fuel_catalogs.sql =====
CREATE OR REPLACE FUNCTION catalogs.__seed_fuel_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql text;
BEGIN
  sql := format(
    $SQL$
      WITH cos AS (
        SELECT id
        FROM org.companies
        WHERE deactivated_at IS NULL
      )
      INSERT INTO catalogs.%I
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      SELECT
        cos.id,
        x.code,
        x.display_name,
        x.description,
        COALESCE(x.metadata, '{}'::jsonb),
        true,
        x.sort_order
      FROM cos
      CROSS JOIN jsonb_to_recordset($1) AS x(
        code text,
        display_name text,
        description text,
        metadata jsonb,
        sort_order int
      )
      ON CONFLICT DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
END
$$;

-- ===== From 0068_p3_t11_21_8a_fleet_catalogs.sql =====
CREATE OR REPLACE FUNCTION catalogs.__seed_fleet_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql text;
BEGIN
  sql := format(
    $SQL$
      INSERT INTO catalogs.%I (code, name, description, is_active, sort_order)
      SELECT x.code, x.name, x.description, true, x.sort_order
      FROM jsonb_to_recordset($1) AS x(
        code text,
        name text,
        description text,
        sort_order int
      )
      ON CONFLICT (code) DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
END
$$;

-- ===== From 0072_p5_t1_1_banking_bank_accounts.sql =====
CREATE SCHEMA IF NOT EXISTS banking;
CREATE TABLE IF NOT EXISTS banking.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  plaid_item_id text,
  plaid_access_token text,
  plaid_account_id text,
  institution_name text,
  account_name text,
  account_type text,
  account_mask text,
  current_balance_cents bigint NOT NULL DEFAULT 0,
  available_balance_cents bigint NOT NULL DEFAULT 0,
  currency_code char(3) NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'active', 'disconnected', 'needs_reauth', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_active
  ON banking.bank_accounts (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_plaid_item
  ON banking.bank_accounts (plaid_item_id)
  WHERE plaid_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_accounts_sync_status_last_synced
  ON banking.bank_accounts (sync_status, last_synced_at)
  WHERE sync_status <> 'disconnected';

-- ===== From 0073_p5_t1_1_banking_bank_transactions.sql =====
CREATE SCHEMA IF NOT EXISTS banking;
CREATE TABLE IF NOT EXISTS banking.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  plaid_transaction_id text UNIQUE,
  transaction_date date NOT NULL,
  posted_date date,
  amount_cents bigint NOT NULL,
  description text,
  merchant_name text,
  plaid_category text[] NOT NULL DEFAULT '{}',
  pending boolean NOT NULL DEFAULT false,
  is_credit boolean NOT NULL DEFAULT false,
  matched_load_id uuid REFERENCES mdata.loads(id),
  matched_bill_id uuid,
  matched_settlement_id uuid,
  qbo_synced_at timestamptz,
  qbo_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date
  ON banking.bank_transactions (bank_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_date
  ON banking.bank_transactions (operating_company_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_load
  ON banking.bank_transactions (matched_load_id)
  WHERE matched_load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_unsynced_qbo
  ON banking.bank_transactions (qbo_synced_at)
  WHERE qbo_synced_at IS NULL;

-- ===== From 0074_p5_t1_1_banking_transaction_categories.sql =====
CREATE SCHEMA IF NOT EXISTS banking;
CREATE TABLE IF NOT EXISTS banking.transaction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  plaid_category_pattern text NOT NULL,
  coa_account_id uuid,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_company_priority
  ON banking.transaction_categories (operating_company_id, priority);

-- ===== From 0075_p5_t1_1_banking_reconciliation_sessions.sql =====
CREATE SCHEMA IF NOT EXISTS banking;
CREATE TABLE IF NOT EXISTS banking.reconciliation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_balance_cents bigint,
  book_balance_cents bigint,
  variance_cents bigint,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reconciled', 'disputed')),
  reconciled_by_user_id uuid REFERENCES identity.users(id),
  reconciled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_company_period
  ON banking.reconciliation_sessions (operating_company_id, period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_account_status
  ON banking.reconciliation_sessions (bank_account_id, status);

-- ===== From 0087_p5_t4_bank_transactions_coa_account_id.sql =====
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS coa_account_id uuid;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_coa_account_id
  ON banking.bank_transactions (operating_company_id, coa_account_id)
  WHERE coa_account_id IS NOT NULL;

-- ===== From 0088_p5_t5_settlement_payment_state.sql =====
ALTER TABLE org.companies
  ADD COLUMN IF NOT EXISTS auto_queue_settlement_payments boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'unpaid'
        CHECK (payment_state IN ('unpaid','queued','sent_to_bank','cleared','bounced','manual_paid')),
      ADD COLUMN IF NOT EXISTS payment_queued_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_cleared_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_bank_reference text,
      ADD COLUMN IF NOT EXISTS payment_bounced_reason text,
      ADD COLUMN IF NOT EXISTS payment_method text;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_pay.settlements') IS NOT NULL THEN
    ALTER TABLE driver_pay.settlements
      ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'unpaid'
        CHECK (payment_state IN ('unpaid','queued','sent_to_bank','cleared','bounced','manual_paid')),
      ADD COLUMN IF NOT EXISTS payment_queued_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_cleared_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_bank_reference text,
      ADD COLUMN IF NOT EXISTS payment_bounced_reason text,
      ADD COLUMN IF NOT EXISTS payment_method text;
  END IF;
END
$$;
CREATE TABLE IF NOT EXISTS driver_finance.settlement_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  event_type text NOT NULL CHECK (event_type IN ('queued','sent','cleared','bounced','retried','marked_paid_manually')),
  payload jsonb,
  user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settlement_payment_events_settlement
  ON driver_finance.settlement_payment_events (operating_company_id, settlement_id, created_at DESC);
CREATE OR REPLACE FUNCTION driver_finance.prevent_settlement_payment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'driver_finance.settlement_payment_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_settlement_payment_events_no_mutation ON driver_finance.settlement_payment_events;

-- ===== From 0089_p5_d1_banking_transfers.sql =====
CREATE SCHEMA IF NOT EXISTS banking;
CREATE TABLE IF NOT EXISTS banking.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  transfer_type text NOT NULL CHECK (transfer_type IN ('bank_to_bank', 'cc_payment', 'cash_deposit', 'owner_contribution', 'owner_distribution')),
  from_account_id uuid NOT NULL,
  from_account_kind text NOT NULL CHECK (from_account_kind IN ('bank', 'cc', 'coa')),
  to_account_id uuid NOT NULL,
  to_account_kind text NOT NULL CHECK (to_account_kind IN ('bank', 'cc', 'coa')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  memo text,
  reference_number text,
  qbo_journal_entry_id text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.users(id),
  revoked_reason text
);
CREATE INDEX IF NOT EXISTS idx_banking_transfers_company_date
  ON banking.transfers (operating_company_id, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_banking_transfers_from_account_active
  ON banking.transfers (from_account_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_banking_transfers_to_account_active
  ON banking.transfers (to_account_id)
  WHERE revoked_at IS NULL;

-- ===== From 0090_p5_d2_bill_payment_balance.sql =====
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE TABLE IF NOT EXISTS accounting.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vendor_id text,
  vendor_uuid text,
  display_id text,
  linked_work_order_uuid uuid,
  bill_number text,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  amount_cents bigint,
  total_amount numeric(12,2),
  paid_cents bigint NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  memo text,
  coa_account_id uuid,
  qbo_bill_id text,
  qbo_sync_pending boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.users(id),
  revoked_reason text
);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS vendor_id text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS vendor_uuid text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS linked_work_order_uuid uuid;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS bill_number text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS bill_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS amount_cents bigint;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS total_amount numeric(12,2);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS paid_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS memo text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS coa_account_id uuid;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS qbo_bill_id text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS qbo_sync_pending boolean NOT NULL DEFAULT false;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS revoked_reason text;
CREATE TABLE IF NOT EXISTS accounting.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bill_id uuid NOT NULL REFERENCES accounting.bills(id),
  vendor_id text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint,
  amount numeric(12,2),
  payment_method text NOT NULL,
  from_bank_account_id uuid,
  check_number text,
  reference_number text,
  memo text,
  qbo_bill_payment_id text,
  advance_id uuid,
  status text NOT NULL DEFAULT 'posted',
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.users(id),
  revoked_reason text
);
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS vendor_id text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS payment_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS amount_cents bigint;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'check';
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS from_bank_account_id uuid;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS check_number text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS memo text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS qbo_bill_payment_id text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS advance_id uuid;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS revoked_reason text;
CREATE INDEX IF NOT EXISTS idx_accounting_bills_company_vendor_status
  ON accounting.bills (operating_company_id, vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_company_due_open
  ON accounting.bills (operating_company_id, due_date)
  WHERE status IN ('open', 'partial', 'partially_paid', 'unpaid');
CREATE INDEX IF NOT EXISTS idx_accounting_bill_payments_bill_id
  ON accounting.bill_payments (bill_id);
CREATE INDEX IF NOT EXISTS idx_accounting_bill_payments_company_date
  ON accounting.bill_payments (operating_company_id, payment_date DESC);
CREATE OR REPLACE VIEW accounting.vendor_balances
WITH (security_invoker = true)
AS
WITH normalized AS (
  SELECT
    b.operating_company_id,
    COALESCE(NULLIF(b.vendor_id, ''), NULLIF(b.vendor_uuid, '')) AS vendor_id,
    GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0) AS amount_cents,
    LEAST(
      GREATEST(
        COALESCE(
          b.paid_cents,
          CASE
            WHEN b.status IN ('paid') THEN COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint)
            WHEN b.status IN ('partial', 'partially_paid') THEN ROUND(COALESCE(b.paid_amount, 0) * 100)::bigint
            ELSE 0
          END
        ),
        0
      ),
      GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0)
    ) AS paid_cents,
    b.bill_date,
    b.due_date,
    b.status,
    b.revoked_at
  FROM accounting.bills b
)
SELECT
  n.operating_company_id,
  n.vendor_id,
  SUM(n.amount_cents - n.paid_cents)::bigint AS balance_cents,
  COUNT(*) FILTER (
    WHERE n.status IN ('open', 'partial', 'partially_paid', 'unpaid')
      AND n.amount_cents > n.paid_cents
      AND n.revoked_at IS NULL
  )::int AS open_bill_count,
  MIN(n.due_date) FILTER (
    WHERE n.status IN ('open', 'partial', 'partially_paid', 'unpaid')
      AND n.amount_cents > n.paid_cents
      AND n.revoked_at IS NULL
  ) AS next_due_date,
  MAX(n.bill_date) AS last_bill_date
FROM normalized n
WHERE n.vendor_id IS NOT NULL
  AND n.revoked_at IS NULL
GROUP BY n.operating_company_id, n.vendor_id;

-- ===== From 0091_p5_d3_qbo_vendor_driver_asset_linkage.sql =====
CREATE UNIQUE INDEX IF NOT EXISTS idx_mdata_drivers_company_qbo_vendor_unique
  ON mdata.drivers (operating_company_id, qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mdata_drivers_qbo_vendor
  ON mdata.drivers (qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;
ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS qbo_class_id text;
CREATE INDEX IF NOT EXISTS idx_mdata_units_qbo_class
  ON mdata.units (qbo_class_id)
  WHERE qbo_class_id IS NOT NULL;
ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS qbo_class_id text;
CREATE INDEX IF NOT EXISTS idx_mdata_equipment_qbo_class
  ON mdata.equipment (qbo_class_id)
  WHERE qbo_class_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS integrations.qbo_vendor_linkage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('driver', 'unit', 'equipment', 'asset')),
  entity_id uuid NOT NULL,
  qbo_vendor_id text,
  qbo_class_id text,
  previous_qbo_vendor_id text,
  previous_qbo_class_id text,
  action text NOT NULL CHECK (action IN ('linked', 'unlinked', 'changed', 'auto_suggested')),
  reason text NOT NULL,
  user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qbo_vendor_linkage_events_company_entity
  ON integrations.qbo_vendor_linkage_events (operating_company_id, entity_type, entity_id, created_at DESC);

-- ===== From 0092_p5_d4_manual_journal_entries.sql =====
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE TABLE IF NOT EXISTS accounting.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entry_date date NOT NULL,
  memo text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  qbo_journal_entry_id text,
  qbo_sync_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS accounting.journal_entry_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  journal_entry_uuid uuid NOT NULL REFERENCES accounting.journal_entries(id) ON DELETE CASCADE,
  line_sequence int NOT NULL CHECK (line_sequence > 0),
  account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  class_id uuid REFERENCES catalogs.classes(id),
  entity_uuid uuid,
  debit_or_credit text NOT NULL CHECK (debit_or_credit IN ('debit', 'credit')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_entry_date
  ON accounting.journal_entries (operating_company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entry_postings_entry_uuid
  ON accounting.journal_entry_postings (journal_entry_uuid);
CREATE OR REPLACE FUNCTION accounting.ensure_journal_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id uuid;
  debit_total bigint;
  credit_total bigint;
BEGIN
  target_id := COALESCE(NEW.journal_entry_uuid, OLD.journal_entry_uuid);
  IF target_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE 0 END), 0)::bigint
  INTO debit_total, credit_total
  FROM accounting.journal_entry_postings
  WHERE journal_entry_uuid = target_id;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % is not balanced (debits=% credits=%)', target_id, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

-- ===== From 0093_p5_d5_load_fk_invariant_wo_time.sql =====
-- G18: enforce load linkage for over-the-road expense activity.
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id),
  ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS load_exemption_reason text,
  ADD COLUMN IF NOT EXISTS line_category text;
CREATE INDEX IF NOT EXISTS idx_expense_lines_load
  ON accounting.expense_lines (load_id)
  WHERE load_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS accounting.line_category_load_required (
  line_category text PRIMARY KEY,
  description text NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE
);
INSERT INTO accounting.line_category_load_required (line_category, description) VALUES
  ('diesel', 'Fuel purchases - must tie to a load'),
  ('def', 'DEF - must tie to a load'),
  ('toll', 'Tolls - must tie to a load'),
  ('scale', 'Scale fees - must tie to a load'),
  ('lumper', 'Lumper fees - must tie to a load'),
  ('parking', 'Truck parking - must tie to a load'),
  ('roadside_repair', 'Roadside repairs - must tie to a load'),
  ('detention_paid', 'Detention paid out - must tie to a load'),
  ('over_road_other', 'Other over-the-road expense - must tie to a load')
ON CONFLICT (line_category) DO NOTHING;
CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant()
RETURNS trigger AS $$
DECLARE
  v_required boolean := false;
BEGIN
  IF NEW.load_exemption_reason IS NOT NULL THEN
    IF length(trim(NEW.load_exemption_reason)) < 20 THEN
      RAISE EXCEPTION
        'E_LOAD_EXEMPTION_REASON_TOO_SHORT: load_exemption_reason must be >=20 chars';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME = 'expense_lines' THEN
    v_required := COALESCE(NEW.load_required, false);
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM accounting.line_category_load_required r
        WHERE r.line_category = NEW.line_category
      ) INTO v_required;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
  END IF;

  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_LOAD_FK_REQUIRED: %.% category=% requires load_id (G18 invariant). Provide load_id OR load_exemption_reason >=20 chars.',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      COALESCE(NEW.line_category, 'n/a');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_expense_line_load_fk ON accounting.expense_lines;
-- G19: work-order open/close tracking with generated duration.
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS duration_seconds bigint
    GENERATED ALWAYS AS (
      CASE
        WHEN closed_at IS NOT NULL AND opened_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (closed_at - opened_at))::bigint
        ELSE NULL
      END
    ) STORED;
CREATE INDEX IF NOT EXISTS idx_wo_duration
  ON maintenance.work_orders (operating_company_id, duration_seconds DESC)
  WHERE duration_seconds IS NOT NULL;
CREATE OR REPLACE FUNCTION maintenance.wo_set_opened_at()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.opened_at IS NULL THEN
    NEW.opened_at := COALESCE(NEW.created_at, now());
  ELSIF TG_OP = 'UPDATE' AND OLD.opened_at IS DISTINCT FROM NEW.opened_at THEN
    RAISE EXCEPTION 'E_WO_OPENED_AT_IMMUTABLE: opened_at cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_wo_set_opened_at ON maintenance.work_orders;
CREATE OR REPLACE FUNCTION maintenance.wo_set_closed_at()
RETURNS trigger AS $$
BEGIN
  IF OLD.closed_at IS NOT NULL THEN
    NEW.closed_at := OLD.closed_at;
    RETURN NEW;
  END IF;

  IF (NEW.status IN ('closed', 'completed', 'voided', 'complete', 'cancelled'))
     AND (COALESCE(OLD.status, '') NOT IN ('closed', 'completed', 'voided', 'complete', 'cancelled'))
     AND NEW.closed_at IS NULL
  THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_wo_set_closed_at ON maintenance.work_orders;

-- ===== From 0094_p5_e1_auto_deduct_escrow_load_abandonment.sql =====
CREATE TABLE IF NOT EXISTS dispatch.load_abandonments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  driver_id uuid REFERENCES mdata.drivers(id),
  unit_id uuid REFERENCES mdata.units(id),
  abandoned_at timestamptz NOT NULL DEFAULT now(),
  abandonment_type text NOT NULL CHECK (abandonment_type IN ('walkoff', 'no_show', 'refused_delivery', 'dropped_trailer', 'other')),
  reported_by_user_id uuid REFERENCES identity.users(id),
  abandonment_location text,
  abandonment_notes text,
  estimated_cost_cents bigint CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents > 0),
  recovery_driver_id uuid REFERENCES mdata.drivers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_load_abandon_load ON dispatch.load_abandonments (load_id);
CREATE INDEX IF NOT EXISTS idx_load_abandon_driver ON dispatch.load_abandonments (driver_id, abandoned_at DESC) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_load_abandon_company_date ON dispatch.load_abandonments (operating_company_id, abandoned_at DESC);
CREATE TABLE IF NOT EXISTS driver_finance.escrow_deductions_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  source_type text NOT NULL CHECK (source_type IN ('load_abandonment', 'damage_claim', 'manual_proposal')),
  source_id uuid,
  load_id uuid REFERENCES mdata.loads(id),
  proposed_amount_cents bigint NOT NULL CHECK (proposed_amount_cents > 0),
  proposed_reason text NOT NULL,
  proposed_breakdown_json jsonb,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  proposed_by_system boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES identity.users(id),
  review_notes text,
  resulting_deduction_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  owner_notified_at timestamptz,
  wf064_requested_at timestamptz,
  wf064_reminder_7d_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escrow_pending_driver_status
  ON driver_finance.escrow_deductions_pending (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_escrow_pending_company_status
  ON driver_finance.escrow_deductions_pending (operating_company_id, status, proposed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_pending_source
  ON driver_finance.escrow_deductions_pending (operating_company_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  deduction_type text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  applied_to_settlement_id uuid,
  source_pending_id uuid REFERENCES driver_finance.escrow_deductions_pending(id),
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_settlement_deductions_driver
  ON driver_finance.driver_settlement_deductions (driver_id, created_at DESC);
CREATE OR REPLACE FUNCTION dispatch.auto_propose_escrow_on_abandonment()
RETURNS trigger AS $$
DECLARE
  v_abandonment_id uuid;
  v_estimated_cost_cents bigint;
  v_load_value_cents bigint;
  v_abandonment_type text;
  v_breakdown jsonb;
BEGIN
  IF NEW.status NOT IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_primary_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_load_value_cents := GREATEST(COALESCE(NEW.rate_total_cents, 0), 0);
  v_estimated_cost_cents := GREATEST((v_load_value_cents * 15) / 100, 50000);
  v_abandonment_type := CASE NEW.status
    WHEN 'driver_walkoff' THEN 'walkoff'
    WHEN 'driver_no_show' THEN 'no_show'
    ELSE 'other'
  END;

  INSERT INTO dispatch.load_abandonments (
    operating_company_id,
    load_id,
    driver_id,
    unit_id,
    abandoned_at,
    abandonment_type,
    estimated_cost_cents
  ) VALUES (
    NEW.operating_company_id,
    NEW.id,
    NEW.assigned_primary_driver_id,
    NEW.assigned_unit_id,
    now(),
    v_abandonment_type,
    v_estimated_cost_cents
  ) RETURNING id INTO v_abandonment_id;

  v_breakdown := jsonb_build_object(
    'load_value_cents', v_load_value_cents,
    'percent_factor', 15,
    'minimum_floor_cents', 50000,
    'calculated_cents', v_estimated_cost_cents,
    'load_number', NEW.load_number,
    'abandonment_type', v_abandonment_type
  );

  INSERT INTO driver_finance.escrow_deductions_pending (
    operating_company_id,
    driver_id,
    source_type,
    source_id,
    load_id,
    proposed_amount_cents,
    proposed_reason,
    proposed_breakdown_json,
    proposed_by_system
  ) VALUES (
    NEW.operating_company_id,
    NEW.assigned_primary_driver_id,
    'load_abandonment',
    v_abandonment_id,
    NEW.id,
    v_estimated_cost_cents,
    'Auto-proposed: load ' || COALESCE(NEW.load_number, NEW.id::text) || ' abandoned (' || NEW.status::text || ')',
    v_breakdown,
    true
  )
  ON CONFLICT (operating_company_id, source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_auto_propose_escrow_on_abandon ON mdata.loads;

-- ===== From 0095_p5_e5_severe_repair_oos_estimate.sql =====
ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS is_oos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oos_since timestamptz,
  ADD COLUMN IF NOT EXISTS oos_reason text,
  ADD COLUMN IF NOT EXISTS oos_location text;
CREATE INDEX IF NOT EXISTS idx_units_oos
  ON mdata.units ((COALESCE(currently_leased_to_company_id, owner_company_id)), is_oos, oos_since)
  WHERE is_oos = true;
CREATE TABLE IF NOT EXISTS maintenance.severe_repair_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  trigger_wo_id uuid REFERENCES maintenance.work_orders(id),
  damage_severity text NOT NULL CHECK (damage_severity IN ('severe', 'out_of_service', 'total_loss')),
  estimate_status text NOT NULL DEFAULT 'open' CHECK (estimate_status IN ('open', 'awaiting_approval', 'approved', 'rejected', 'completed')),
  estimate_location text,
  estimated_labor_cents bigint NOT NULL DEFAULT 0,
  estimated_parts_cents bigint NOT NULL DEFAULT 0,
  estimated_outside_service_cents bigint NOT NULL DEFAULT 0,
  estimated_total_cents bigint GENERATED ALWAYS AS (
    estimated_labor_cents
    + estimated_parts_cents
    + estimated_outside_service_cents
  ) STORED,
  description text,
  estimated_completion_date date,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, unit_id, trigger_wo_id)
);
CREATE INDEX IF NOT EXISTS idx_severe_estimate_unit
  ON maintenance.severe_repair_estimates (unit_id, estimate_status);
CREATE INDEX IF NOT EXISTS idx_severe_estimate_company_open
  ON maintenance.severe_repair_estimates (operating_company_id, estimate_status, estimated_total_cents DESC)
  WHERE estimate_status IN ('open', 'awaiting_approval', 'approved');
CREATE OR REPLACE FUNCTION maintenance.recompute_severe_repair_estimate_for_wo(p_wo_id uuid)
RETURNS void AS $$
DECLARE
  v_wo RECORD;
  v_severity text;
  v_labor_cents bigint := 0;
  v_parts_cents bigint := 0;
  v_outside_cents bigint := 0;
  v_open_count int := 0;
BEGIN
  SELECT
    w.id,
    w.operating_company_id,
    w.unit_id,
    lower(COALESCE(w.severity, '')) AS severity,
    lower(COALESCE(w.status, '')) AS status,
    w.repair_location,
    w.description,
    w.opened_at
  INTO v_wo
  FROM maintenance.work_orders w
  WHERE w.id = p_wo_id
  LIMIT 1;

  IF NOT FOUND OR v_wo.unit_id IS NULL THEN
    RETURN;
  END IF;

  IF v_wo.severity = 'out_of_service' THEN
    v_severity := 'out_of_service';
  ELSIF v_wo.severity = 'total_loss' THEN
    v_severity := 'total_loss';
  ELSE
    v_severity := 'severe';
  END IF;

  IF v_wo.severity NOT IN ('severe', 'out_of_service', 'total_loss')
     OR v_wo.status IN ('complete', 'completed', 'cancelled', 'closed', 'voided')
  THEN
    UPDATE maintenance.severe_repair_estimates
    SET estimate_status = CASE
          WHEN estimate_status IN ('open', 'awaiting_approval', 'approved') THEN 'completed'
          ELSE estimate_status
        END,
        refreshed_at = now(),
        updated_at = now()
    WHERE trigger_wo_id = p_wo_id;

    SELECT COUNT(*)::int
    INTO v_open_count
    FROM maintenance.severe_repair_estimates e
    WHERE e.unit_id = v_wo.unit_id
      AND e.estimate_status IN ('open', 'awaiting_approval', 'approved');

    IF v_open_count = 0 THEN
      UPDATE mdata.units
      SET is_oos = false,
          oos_since = NULL,
          oos_reason = NULL,
          oos_location = NULL
      WHERE id = v_wo.unit_id;
    END IF;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(ROUND(CASE WHEN wl.line_type = 'labor' THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint,
    COALESCE(SUM(ROUND(CASE WHEN wl.line_type = 'parts' THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint,
    COALESCE(SUM(ROUND(CASE WHEN wl.line_type NOT IN ('labor', 'parts') THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint
  INTO v_labor_cents, v_parts_cents, v_outside_cents
  FROM maintenance.work_order_lines wl
  WHERE wl.work_order_id = p_wo_id;

  INSERT INTO maintenance.severe_repair_estimates (
    operating_company_id,
    unit_id,
    trigger_wo_id,
    damage_severity,
    estimate_status,
    estimate_location,
    estimated_labor_cents,
    estimated_parts_cents,
    estimated_outside_service_cents,
    description,
    estimated_completion_date,
    refreshed_at
  ) VALUES (
    v_wo.operating_company_id,
    v_wo.unit_id,
    v_wo.id,
    v_severity,
    'open',
    COALESCE(v_wo.repair_location, ''),
    v_labor_cents,
    v_parts_cents,
    v_outside_cents,
    LEFT(COALESCE(v_wo.description, ''), 500),
    NULL,
    now()
  )
  ON CONFLICT (operating_company_id, unit_id, trigger_wo_id) DO UPDATE
  SET damage_severity = EXCLUDED.damage_severity,
      estimate_status = CASE
        WHEN maintenance.severe_repair_estimates.estimate_status IN ('completed', 'rejected') THEN 'open'
        ELSE maintenance.severe_repair_estimates.estimate_status
      END,
      estimated_labor_cents = EXCLUDED.estimated_labor_cents,
      estimated_parts_cents = EXCLUDED.estimated_parts_cents,
      estimated_outside_service_cents = EXCLUDED.estimated_outside_service_cents,
      estimate_location = EXCLUDED.estimate_location,
      description = EXCLUDED.description,
      refreshed_at = now(),
      updated_at = now();

  UPDATE mdata.units
  SET is_oos = true,
      oos_since = COALESCE(oos_since, now()),
      oos_reason = COALESCE(oos_reason, v_severity || ' damage'),
      oos_location = COALESCE(oos_location, v_wo.repair_location)
  WHERE id = v_wo.unit_id
    AND is_oos = false;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION maintenance.upsert_severe_repair_estimate()
RETURNS trigger AS $$
BEGIN
  PERFORM maintenance.recompute_severe_repair_estimate_for_wo(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_upsert_severe_repair_estimate ON maintenance.work_orders;
CREATE OR REPLACE FUNCTION maintenance.refresh_severe_repair_estimate_from_line()
RETURNS trigger AS $$
DECLARE
  v_wo_id uuid;
BEGIN
  v_wo_id := COALESCE(NEW.work_order_id, OLD.work_order_id);
  IF v_wo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM maintenance.recompute_severe_repair_estimate_for_wo(v_wo_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_refresh_severe_repair_estimate_from_line ON maintenance.work_order_lines;
CREATE OR REPLACE FUNCTION maintenance.unit_back_in_service_check()
RETURNS trigger AS $$
DECLARE
  v_remaining_open int;
BEGIN
  IF NEW.estimate_status NOT IN ('completed', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int
  INTO v_remaining_open
  FROM maintenance.severe_repair_estimates
  WHERE unit_id = NEW.unit_id
    AND estimate_status IN ('open', 'awaiting_approval', 'approved')
    AND id <> NEW.id;

  IF v_remaining_open = 0 THEN
    UPDATE mdata.units
    SET is_oos = false,
        oos_since = NULL,
        oos_reason = NULL,
        oos_location = NULL
    WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_unit_back_in_service_check ON maintenance.severe_repair_estimates;

-- ===== From 0096_p5_e2_settlement_disputes_workflow.sql =====
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping driver_finance.driver_settlement_disputes reconciliation: driver_finance.driver_settlements missing';
  ELSE
    CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_disputes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id uuid NOT NULL REFERENCES org.companies(id),
      settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
      driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
      dispute_category text NOT NULL CHECK (dispute_category IN (
        'missing_pay', 'wrong_deduction', 'miscalculated_mileage',
        'wrong_rate', 'detention_not_paid', 'cash_advance_dispute',
        'fine_dispute', 'escrow_dispute', 'other'
      )),
      dispute_description text NOT NULL CHECK (length(trim(dispute_description)) >= 20),
      disputed_amount_cents bigint,
      status text NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'under_review', 'resolved_in_favor', 'resolved_rejected',
        'partially_resolved', 'withdrawn'
      )),
      opened_by_driver boolean NOT NULL DEFAULT true,
      opened_by_user_id uuid REFERENCES identity.users(id),
      opened_at timestamptz NOT NULL DEFAULT now(),
      reviewed_by_user_id uuid REFERENCES identity.users(id),
      reviewed_at timestamptz,
      resolution_notes text,
      resolution_amount_cents bigint,
      resolution_journal_entry_id uuid,
      closed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlement_disputes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_dispute_settlement
      ON driver_finance.driver_settlement_disputes (settlement_id);
    CREATE INDEX IF NOT EXISTS idx_dispute_driver_status
      ON driver_finance.driver_settlement_disputes (driver_id, status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dispute_company_open
      ON driver_finance.driver_settlement_disputes (operating_company_id, status, opened_at DESC)
      WHERE status IN ('open', 'under_review');
  END IF;
END
$$;

-- ===== From 0097_p5_e3_team_drivers_split.sql =====
ALTER TABLE mdata.driver_teams
  ADD COLUMN IF NOT EXISTS split_method text NOT NULL DEFAULT '50_50'
    CHECK (split_method IN ('50_50', '60_40', '70_30', 'mileage_prorated', 'hours_prorated', 'custom')),
  ADD COLUMN IF NOT EXISTS primary_share_pct numeric(5,2) NOT NULL DEFAULT 50.00
    CHECK (primary_share_pct >= 0 AND primary_share_pct <= 100),
  ADD COLUMN IF NOT EXISTS co_share_pct numeric(5,2) NOT NULL DEFAULT 50.00
    CHECK (co_share_pct >= 0 AND co_share_pct <= 100);
CREATE INDEX IF NOT EXISTS idx_loads_team
  ON mdata.loads (team_id) WHERE team_id IS NOT NULL;
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping driver_finance.team_settlement_splits reconciliation: driver_finance.driver_settlements missing';
  ELSE
    CREATE TABLE IF NOT EXISTS driver_finance.team_settlement_splits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id uuid NOT NULL REFERENCES org.companies(id),
      load_id uuid NOT NULL REFERENCES mdata.loads(id),
      team_id uuid NOT NULL REFERENCES mdata.driver_teams(id),
      driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
      pay_role text NOT NULL CHECK (pay_role IN ('primary', 'co')),
      split_method text NOT NULL,
      share_pct numeric(5,2) NOT NULL,
      total_load_pay_cents bigint NOT NULL,
      driver_pay_cents bigint NOT NULL,
      applied_to_settlement_id uuid REFERENCES driver_finance.driver_settlements(id),
      computed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (load_id, driver_id)
    );
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.team_settlement_splits') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_team_splits_driver
      ON driver_finance.team_settlement_splits (driver_id, computed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_team_splits_load
      ON driver_finance.team_settlement_splits (load_id);
  END IF;
END
$$;

-- ===== From 0098_p5_f1_roadservice_bucket.sql =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'wo_bucket_enum'
      AND n.nspname = 'maintenance'
  ) THEN
    CREATE TYPE maintenance.wo_bucket_enum AS ENUM ('in_house', 'external', 'roadside');
  END IF;
END $$;
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS bucket maintenance.wo_bucket_enum NOT NULL DEFAULT 'in_house',
  ADD COLUMN IF NOT EXISTS roadside_callout_at timestamptz,
  ADD COLUMN IF NOT EXISTS roadside_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS roadside_provider_vendor_id uuid REFERENCES mdata.vendors(id),
  ADD COLUMN IF NOT EXISTS roadside_location text,
  ADD COLUMN IF NOT EXISTS roadside_breakdown_load_id uuid REFERENCES mdata.loads(id);
ALTER TABLE maintenance.work_orders
  ADD COLUMN roadside_response_minutes int GENERATED ALWAYS AS (
    CASE
      WHEN roadside_arrived_at IS NOT NULL AND roadside_callout_at IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (roadside_arrived_at - roadside_callout_at)) / 60)::int
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_wo_bucket
  ON maintenance.work_orders (operating_company_id, bucket, status);

-- ===== From 0099_p5_f2_safety_active_filter.sql =====
ALTER TABLE identity.user_preferences
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE VIEW safety.v_safety_events_with_active
WITH (security_invoker = true) AS
SELECT
  e.*,
  (
    COALESCE(e.status::text IN ('closed', 'resolved', 'voided'), false) = false
    OR EXISTS (
      SELECT 1
      FROM safety.civil_fines f
      WHERE f.operating_company_id = e.operating_company_id
        AND f.subject_type = 'driver'
        AND f.subject_driver_id = e.driver_id
        AND f.status IN ('open', 'contested')
    )
  ) AS is_active
FROM views.safety_events_with_driver e;

-- ===== From 0100_p5_f3_quicksave_assignments.sql =====
ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS is_quicksave_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quicksave_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quicksave_pending_fields jsonb;
CREATE INDEX IF NOT EXISTS idx_loads_quicksave_draft
  ON mdata.loads (operating_company_id, is_quicksave_draft)
  WHERE is_quicksave_draft = true;
CREATE TABLE IF NOT EXISTS dispatch.load_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  assignment_method text NOT NULL CHECK (assignment_method IN ('full_form', 'quicksave', 'drag_drop', 'auto_reassign')),
  previous_driver_id uuid REFERENCES mdata.drivers(id),
  new_driver_id uuid REFERENCES mdata.drivers(id),
  previous_unit_id uuid REFERENCES mdata.units(id),
  new_unit_id uuid REFERENCES mdata.units(id),
  previous_trailer_id uuid REFERENCES mdata.equipment(id),
  new_trailer_id uuid REFERENCES mdata.equipment(id),
  assigned_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  warnings_acknowledged jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_history_load
  ON dispatch.load_assignment_history (load_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_history_driver
  ON dispatch.load_assignment_history (new_driver_id, assigned_at DESC);

-- ===== From 0101_p5_f4_cancellation_reasons.sql =====
DO $$
BEGIN
  IF to_regclass('catalogs.cancellation_reasons') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'catalogs'
        AND table_name = 'cancellation_reasons'
        AND column_name = 'reason_code'
    ) THEN
      EXECUTE 'ALTER TABLE catalogs.cancellation_reasons RENAME TO cancellation_reasons_company_catalog_legacy';
      RAISE NOTICE 'Renamed 0062 generic catalogs.cancellation_reasons stub to cancellation_reasons_company_catalog_legacy';
    END IF;
  END IF;
END
$$;
CREATE TABLE IF NOT EXISTS catalogs.cancellation_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_code text UNIQUE NOT NULL,
  reason_label text NOT NULL,
  billable_to_customer_default boolean NOT NULL DEFAULT false,
  requires_owner_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO catalogs.cancellation_reasons
  (reason_code, reason_label, billable_to_customer_default, requires_owner_approval, sort_order)
VALUES
  ('CUSTOMER_CANCELLED', 'Customer Cancelled', true,  false, 10),
  ('DRIVER_ISSUE', 'Driver Issue', false, true, 20),
  ('EQUIPMENT_ISSUE', 'Equipment Issue', false, false, 30),
  ('WEATHER', 'Weather', false, false, 40),
  ('NO_PICKUP', 'No Pickup Available', false, false, 50),
  ('RATE_DISPUTE', 'Rate Dispute', false, true, 60),
  ('CUSTOMER_BANKRUPTCY', 'Customer Bankruptcy', false, true, 70),
  ('TRUCK_BREAKDOWN', 'Truck Breakdown', false, false, 80),
  ('DRIVER_WALKOFF', 'Driver Walkoff', false, true, 90)
ON CONFLICT (reason_code) DO NOTHING;
CREATE TABLE IF NOT EXISTS dispatch.load_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  reason_code text NOT NULL REFERENCES catalogs.cancellation_reasons(reason_code),
  cancellation_notes text NOT NULL CHECK (length(trim(cancellation_notes)) >= 20),
  billable_to_customer boolean NOT NULL DEFAULT false,
  cancellation_charge_cents bigint,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  cancelled_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  approved_by_user_id uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (load_id)
);
CREATE INDEX IF NOT EXISTS idx_load_cancellations_company
  ON dispatch.load_cancellations (operating_company_id, cancelled_at DESC);

-- ===== From 0102_p5_f5_equipment_dual_confirm_transfer.sql =====
ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES mdata.drivers(id);
CREATE TABLE IF NOT EXISTS mdata.equipment_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id),
  from_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  to_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  transfer_location text,
  status text NOT NULL DEFAULT 'pending_to_confirm' CHECK (status IN ('pending_to_confirm', 'confirmed', 'rejected', 'cancelled', 'expired')),
  initiated_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_driver_id <> to_driver_id)
);
CREATE INDEX IF NOT EXISTS idx_equip_transfer_to_driver_pending
  ON mdata.equipment_transfers (to_driver_id, status)
  WHERE status = 'pending_to_confirm';
CREATE INDEX IF NOT EXISTS idx_equip_transfer_equipment
  ON mdata.equipment_transfers (equipment_id, initiated_at DESC);

-- ===== From 0103_p5_g_t8_driver_vendor_merges.sql =====
CREATE TABLE IF NOT EXISTS mdata.driver_vendor_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  from_qbo_vendor_id text NOT NULL,
  to_qbo_vendor_id text NOT NULL,
  merge_reason text NOT NULL DEFAULT 'duplicate_vendor_cleanup',
  merged_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(from_qbo_vendor_id)) > 0),
  CHECK (length(trim(to_qbo_vendor_id)) > 0),
  CHECK (from_qbo_vendor_id <> to_qbo_vendor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_vendor_merges_once
  ON mdata.driver_vendor_merges (operating_company_id, driver_id, from_qbo_vendor_id, to_qbo_vendor_id);
CREATE INDEX IF NOT EXISTS idx_driver_vendor_merges_company_recent
  ON mdata.driver_vendor_merges (operating_company_id, merged_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_vendor_merges_driver_recent
  ON mdata.driver_vendor_merges (driver_id, merged_at DESC);

-- ===== From 0104_p5_g_g1_faro_daily_imports.sql =====
CREATE SCHEMA IF NOT EXISTS factor;
CREATE TABLE IF NOT EXISTS factor.faro_daily_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  statement_date date NOT NULL,
  statement_reference text NOT NULL DEFAULT 'daily',
  source_filename text,
  imported_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  gross_total_cents bigint NOT NULL DEFAULT 0,
  advance_total_cents bigint NOT NULL DEFAULT 0,
  reserve_total_cents bigint NOT NULL DEFAULT 0,
  fee_total_cents bigint NOT NULL DEFAULT 0,
  chargeback_total_cents bigint NOT NULL DEFAULT 0,
  notes text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_faro_daily_imports_scope
  ON factor.faro_daily_imports (operating_company_id, statement_date, statement_reference);
CREATE INDEX IF NOT EXISTS idx_faro_daily_imports_company_recent
  ON factor.faro_daily_imports (operating_company_id, statement_date DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS factor.faro_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  daily_import_id uuid NOT NULL REFERENCES factor.faro_daily_imports(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text,
  load_id uuid REFERENCES mdata.loads(id),
  gross_amount_cents bigint NOT NULL DEFAULT 0,
  advance_amount_cents bigint NOT NULL DEFAULT 0,
  reserve_amount_cents bigint NOT NULL DEFAULT 0,
  fee_amount_cents bigint NOT NULL DEFAULT 0,
  chargeback_amount_cents bigint NOT NULL DEFAULT 0,
  net_amount_cents bigint NOT NULL DEFAULT 0,
  due_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_faro_invoice_lines_per_import
  ON factor.faro_invoice_lines (daily_import_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_faro_invoice_lines_company_load
  ON factor.faro_invoice_lines (operating_company_id, load_id);
CREATE INDEX IF NOT EXISTS idx_faro_invoice_lines_company_invoice
  ON factor.faro_invoice_lines (operating_company_id, invoice_number);

-- ===== From 0105_p5_g_g2_equipment_loan_infra.sql =====
CREATE TABLE IF NOT EXISTS banking.equipment_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id),
  lender_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  principal_cents bigint NOT NULL CHECK (principal_cents > 0),
  apr_percent numeric(7, 4) NOT NULL DEFAULT 0 CHECK (apr_percent >= 0),
  started_on date NOT NULL,
  maturity_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'defaulted', 'voided')),
  memo text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_company_status
  ON banking.equipment_loans (operating_company_id, status, started_on DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_company_equipment
  ON banking.equipment_loans (operating_company_id, equipment_id);
CREATE TABLE IF NOT EXISTS banking.equipment_loan_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  loan_id uuid NOT NULL REFERENCES banking.equipment_loans(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  attribution_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  memo text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_loan_attributions_loan
  ON banking.equipment_loan_attributions (loan_id, attribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_loan_attributions_load
  ON banking.equipment_loan_attributions (operating_company_id, load_id, attribution_date DESC);
CREATE TABLE IF NOT EXISTS banking.equipment_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  loan_id uuid NOT NULL REFERENCES banking.equipment_loans(id) ON DELETE CASCADE,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  principal_cents bigint NOT NULL DEFAULT 0 CHECK (principal_cents >= 0),
  interest_cents bigint NOT NULL DEFAULT 0 CHECK (interest_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  reference_number text,
  memo text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((principal_cents + interest_cents + fee_cents) <= amount_cents)
);
CREATE INDEX IF NOT EXISTS idx_equipment_loan_payments_loan
  ON banking.equipment_loan_payments (loan_id, paid_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_loan_payments_company_date
  ON banking.equipment_loan_payments (operating_company_id, paid_on DESC);

-- ===== From 0106_p6_foundation_universal_attachments.sql =====
ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'from_load' CHECK (invoice_type IN (
    'from_load','driver_damage','driver_misc','vendor_chargeback',
    'customer_adjustment','manual'
  )),
  ADD COLUMN IF NOT EXISTS bill_to_entity_type text CHECK (bill_to_entity_type IN (
    'customer','driver','vendor','other'
  )),
  ADD COLUMN IF NOT EXISTS bill_to_entity_id uuid,
  ADD COLUMN IF NOT EXISTS auto_deduct_settlement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deducted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deducted_via_settlement_id uuid;
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to
  ON accounting.invoices (operating_company_id, bill_to_entity_type, bill_to_entity_id)
  WHERE bill_to_entity_id IS NOT NULL;

-- ===== From 0109_p6_s1_company_violation_amounts_auto_fine.sql =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'company_violations'
      AND column_name = 'fine_amount_cents_override'
  ) THEN
    ALTER TABLE safety.company_violations
      ADD COLUMN fine_amount_cents_override INTEGER NULL
      CHECK (fine_amount_cents_override IS NULL OR fine_amount_cents_override > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'company_violations'
      AND column_name = 'auto_created_internal_fine_uuid'
  ) THEN
    ALTER TABLE safety.company_violations
      ADD COLUMN auto_created_internal_fine_uuid uuid NULL
      REFERENCES safety.internal_fines(id);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION safety.auto_create_internal_fine_from_violation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_violation_type_amount INTEGER;
  v_violation_type_code TEXT;
  v_final_amount INTEGER;
  v_new_fine_uuid UUID;
  v_reason_id UUID;
BEGIN
  IF NEW.outcome <> 'monetary_fine' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'closed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' AND OLD.outcome = 'monetary_fine' THEN
    RETURN NEW;
  END IF;
  IF NEW.auto_created_internal_fine_uuid IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cvt.amount_cents, cvt.type_code
    INTO v_violation_type_amount, v_violation_type_code
  FROM catalogs.company_violation_types cvt
  WHERE cvt.id = COALESCE(NEW.violation_type_uuid, NEW.violation_type_id)
  LIMIT 1;

  IF v_violation_type_code IS NULL THEN
    SELECT cvt.amount_cents, cvt.type_code
      INTO v_violation_type_amount, v_violation_type_code
    FROM catalogs.company_violation_types cvt
    WHERE cvt.operating_company_id = NEW.operating_company_id
      AND cvt.type_code = COALESCE(NEW.violation_type, '')
    LIMIT 1;
  END IF;

  v_final_amount := COALESCE(NEW.fine_amount_cents_override, v_violation_type_amount);
  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    RAISE EXCEPTION 'E_VIOLATION_AMOUNT_REQUIRED: violation has no catalog amount and no override';
  END IF;

  SELECT id INTO v_reason_id
  FROM catalogs.internal_fine_reasons
  WHERE operating_company_id = NEW.operating_company_id
    AND reason_code = COALESCE(v_violation_type_code, 'GOVERNOR-OVERRIDE')
  LIMIT 1;

  IF v_reason_id IS NULL THEN
    INSERT INTO catalogs.internal_fine_reasons (
      operating_company_id, reason_code, reason_name, default_amount, is_active
    )
    VALUES (
      NEW.operating_company_id,
      COALESCE(v_violation_type_code, 'AUTO-COMPANY-VIOLATION'),
      COALESCE(v_violation_type_code, 'Auto company violation'),
      ROUND(v_final_amount::numeric / 100, 2),
      TRUE
    )
    RETURNING id INTO v_reason_id;
  END IF;

  INSERT INTO safety.internal_fines (
    id,
    operating_company_id,
    driver_id,
    reason_id,
    amount,
    imposed_date,
    imposed_by_user_id,
    approved_by_user_id,
    status,
    notes,
    created_at
  ) VALUES (
    gen_random_uuid(),
    NEW.operating_company_id,
    NEW.driver_id,
    v_reason_id,
    ROUND(v_final_amount::numeric / 100, 2),
    CURRENT_DATE,
    NEW.updated_by_user_id,
    NEW.updated_by_user_id,
    'approved',
    'Auto-issued from company violation: ' || COALESCE(v_violation_type_code, 'unknown'),
    now()
  )
  RETURNING id INTO v_new_fine_uuid;

  NEW.auto_created_internal_fine_uuid := v_new_fine_uuid;
  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS trg_auto_fine_on_violation_resolve ON safety.company_violations;

-- ===== From 0110_p6_d2_book_load_v3_loads_columns.sql =====
DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NULL THEN
    RAISE NOTICE 'Skipping 0110: mdata.loads table not present';
    RETURN;
  END IF;

  ALTER TABLE mdata.loads
    ADD COLUMN IF NOT EXISTS team_id uuid,
    ADD COLUMN IF NOT EXISTS booking_mode TEXT NOT NULL DEFAULT 'single_popup'
      CHECK (booking_mode IN ('single_popup', 'legacy_form')),
    ADD COLUMN IF NOT EXISTS requires_tarps BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tarp_type TEXT,
    ADD COLUMN IF NOT EXISTS lumper_amount_cents INTEGER NOT NULL DEFAULT 0
      CHECK (lumper_amount_cents >= 0),
    ADD COLUMN IF NOT EXISTS presettlement_link_id UUID,
    ADD COLUMN IF NOT EXISTS customer_chargeback_requested BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS customer_chargeback_reason TEXT,
    ADD COLUMN IF NOT EXISTS live_load_number TEXT,
    ADD COLUMN IF NOT EXISTS booked_by_user_id UUID REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS driver_instructions_file_id UUID REFERENCES docs.files(id);
END $$;
CREATE INDEX IF NOT EXISTS idx_loads_chargeback_requested
  ON mdata.loads (operating_company_id, customer_chargeback_requested)
  WHERE customer_chargeback_requested = true;
CREATE INDEX IF NOT EXISTS idx_loads_live_load_number
  ON mdata.loads (operating_company_id, live_load_number)
  WHERE live_load_number IS NOT NULL;

-- ===== From 0111_p6_d2_book_load_v3_stops_columns.sql =====
DO $$
BEGIN
  IF to_regclass('mdata.load_stops') IS NULL THEN
    RAISE NOTICE 'Skipping 0111: mdata.load_stops table not present';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata'
      AND t.typname = 'time_window_type_enum'
  ) THEN
    CREATE TYPE mdata.time_window_type_enum AS ENUM ('appointment', 'first_come_first_serve', 'drop_window');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata'
      AND t.typname = 'lumper_paid_by_enum'
  ) THEN
    CREATE TYPE mdata.lumper_paid_by_enum AS ENUM ('carrier', 'shipper', 'broker', 'receiver', 'unknown');
  END IF;

  ALTER TABLE mdata.load_stops
    ADD COLUMN IF NOT EXISTS time_window_type mdata.time_window_type_enum NOT NULL DEFAULT 'appointment',
    ADD COLUMN IF NOT EXISTS appointment_start_at timestamptz,
    ADD COLUMN IF NOT EXISTS appointment_end_at timestamptz,
    ADD COLUMN IF NOT EXISTS is_extra_stop boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_tarp_stop boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tarp_count integer NOT NULL DEFAULT 0 CHECK (tarp_count >= 0),
    ADD COLUMN IF NOT EXISTS lumper_required boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lumper_paid_by mdata.lumper_paid_by_enum NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS lumper_amount_cents integer NOT NULL DEFAULT 0 CHECK (lumper_amount_cents >= 0),
    ADD COLUMN IF NOT EXISTS stop_notes text;
END $$;
CREATE OR REPLACE FUNCTION mdata.refresh_is_extra_stop(p_load_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  v_first_pickup_seq int;
  v_last_delivery_seq int;
BEGIN
  SELECT MIN(sequence_number) INTO v_first_pickup_seq
  FROM mdata.load_stops
  WHERE load_id = p_load_id
    AND stop_type = 'pickup';

  SELECT MAX(sequence_number) INTO v_last_delivery_seq
  FROM mdata.load_stops
  WHERE load_id = p_load_id
    AND stop_type = 'delivery';

  UPDATE mdata.load_stops ls
  SET is_extra_stop = CASE
    WHEN ls.stop_type IN ('fuel', 'rest', 'border') THEN true
    WHEN v_first_pickup_seq IS NULL OR v_last_delivery_seq IS NULL THEN false
    WHEN ls.sequence_number = v_first_pickup_seq THEN false
    WHEN ls.sequence_number = v_last_delivery_seq THEN false
    ELSE true
  END,
  updated_at = now()
  WHERE ls.load_id = p_load_id;
END;
$func$;
CREATE OR REPLACE FUNCTION mdata.trg_refresh_is_extra_stop()
RETURNS trigger
LANGUAGE plpgsql
AS $trg$
DECLARE
  v_load_id uuid;
BEGIN
  v_load_id := COALESCE(NEW.load_id, OLD.load_id);
  PERFORM mdata.refresh_is_extra_stop(v_load_id);
  RETURN COALESCE(NEW, OLD);
END;
$trg$;
DROP TRIGGER IF EXISTS trg_refresh_is_extra_stop ON mdata.load_stops;

-- ===== Grants for reconciled tables =====
DO $$
BEGIN
  IF to_regclass('catalogs.parts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.parts TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.labor_rates') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.labor_rates TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.maintenance_part_locations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.maintenance_part_locations TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('maintenance.work_order_lines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE maintenance.work_order_lines TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.bill_lines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.bill_lines TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.expense_lines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.expense_lines TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.internal_fine_reasons') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.internal_fine_reasons TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.complaint_types') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.complaint_types TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('safety.internal_fines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safety.internal_fines TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('safety.dot_inspections') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safety.dot_inspections TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('safety.complaints') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safety.complaints TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('safety.hos_violations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safety.hos_violations TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('safety.csa_scores') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safety.csa_scores TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('safety.integrity_observations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safety.integrity_observations TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.audit_event_types') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.audit_event_types TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('compliance.form_425c_reports') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE compliance.form_425c_reports TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('compliance.form_425c_exhibit_a_entries') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE compliance.form_425c_exhibit_a_entries TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('compliance.form_425c_exhibit_b_entries') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE compliance.form_425c_exhibit_b_entries TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.form_425c_company_profiles') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.form_425c_company_profiles TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.qbo_remote_counts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.qbo_remote_counts TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('dispatch.intransit_issues') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch.intransit_issues TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.signed_acknowledgments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_finance.signed_acknowledgments TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('maintenance.dvir_submissions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE maintenance.dvir_submissions TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('maintenance.defects') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE maintenance.defects TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('identity.email_verifications') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE identity.email_verifications TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('reports.run_log') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reports.run_log TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('reports.scheduled_reports') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reports.scheduled_reports TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('mdata.customer_lanes') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mdata.customer_lanes TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.invoices TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.invoice_lines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.invoice_lines TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.payments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.payments TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.payment_applications') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.payment_applications TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.credit_memos') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.credit_memos TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.factoring_advances TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.bank_accounts TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.bank_transactions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.bank_transactions TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.transaction_categories') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.transaction_categories TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.reconciliation_sessions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.reconciliation_sessions TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_payment_events') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_finance.settlement_payment_events TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.transfers') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.transfers TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.bills TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.bill_payments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.bill_payments TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('integrations.qbo_vendor_linkage_events') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE integrations.qbo_vendor_linkage_events TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.journal_entries') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.journal_entries TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.journal_entry_postings') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.journal_entry_postings TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('accounting.line_category_load_required') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting.line_category_load_required TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('dispatch.load_abandonments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch.load_abandonments TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.escrow_deductions_pending') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_finance.escrow_deductions_pending TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_finance.driver_settlement_deductions TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('maintenance.severe_repair_estimates') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE maintenance.severe_repair_estimates TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlement_disputes') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_finance.driver_settlement_disputes TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('driver_finance.team_settlement_splits') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_finance.team_settlement_splits TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('dispatch.load_assignment_history') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch.load_assignment_history TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('catalogs.cancellation_reasons') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogs.cancellation_reasons TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('dispatch.load_cancellations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch.load_cancellations TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('mdata.equipment_transfers') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mdata.equipment_transfers TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('mdata.driver_vendor_merges') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mdata.driver_vendor_merges TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('factor.faro_daily_imports') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE factor.faro_daily_imports TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('factor.faro_invoice_lines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE factor.faro_invoice_lines TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.equipment_loans') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.equipment_loans TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.equipment_loan_attributions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.equipment_loan_attributions TO ih35_app;
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('banking.equipment_loan_payments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banking.equipment_loan_payments TO ih35_app;
  END IF;
END
$$;

COMMIT;
