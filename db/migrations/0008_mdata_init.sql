BEGIN;

CREATE SCHEMA IF NOT EXISTS mdata;
GRANT USAGE ON SCHEMA mdata TO ih35_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'driver_status' AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.driver_status AS ENUM ('Active', 'Probation', 'Inactive', 'Terminated', 'OnLeave');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'unit_status' AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.unit_status AS ENUM ('InService', 'OutOfService', 'InMaintenance', 'Sold', 'Totaled');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'equipment_status' AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.equipment_status AS ENUM ('InService', 'OutOfService', 'InMaintenance', 'Sold', 'Lost');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mdata.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_user_id uuid UNIQUE REFERENCES identity.users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  email text,
  cdl_number text,
  cdl_state text,
  cdl_class text CHECK (cdl_class IS NULL OR cdl_class IN ('A', 'B', 'C')),
  cdl_expires_at date,
  hire_date date,
  termination_date date,
  dot_medical_expires_at date,
  hazmat_endorsement_expires_at date,
  status mdata.driver_status NOT NULL DEFAULT 'Active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_drivers_name ON mdata.drivers (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON mdata.drivers (status);
CREATE INDEX IF NOT EXISTS idx_drivers_identity_user_id ON mdata.drivers (identity_user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_cdl_expires_at ON mdata.drivers (cdl_expires_at);
CREATE INDEX IF NOT EXISTS idx_drivers_dot_medical_expires_at ON mdata.drivers (dot_medical_expires_at);

CREATE TABLE IF NOT EXISTS mdata.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number text NOT NULL UNIQUE,
  vin text NOT NULL UNIQUE,
  make text,
  model text,
  year int CHECK (year IS NULL OR (year >= 1980 AND year <= 2100)),
  license_plate text,
  license_state text,
  status mdata.unit_status NOT NULL DEFAULT 'InService',
  assigned_driver_id uuid REFERENCES mdata.drivers(id),
  acquired_date date,
  disposed_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_units_unit_number ON mdata.units (unit_number);
CREATE INDEX IF NOT EXISTS idx_units_vin ON mdata.units (vin);
CREATE INDEX IF NOT EXISTS idx_units_status ON mdata.units (status);
CREATE INDEX IF NOT EXISTS idx_units_assigned_driver_id ON mdata.units (assigned_driver_id);

CREATE TABLE IF NOT EXISTS mdata.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_code text UNIQUE,
  billing_email text,
  billing_phone text,
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_state text,
  billing_postal_code text,
  billing_country text NOT NULL DEFAULT 'US',
  mc_number text,
  dot_number text,
  payment_terms_id uuid,
  credit_limit_cents bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_name ON mdata.customers (customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON mdata.customers (customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_mc_number ON mdata.customers (mc_number);

CREATE TABLE IF NOT EXISTS mdata.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL,
  vendor_code text UNIQUE,
  vendor_type text NOT NULL CHECK (
    vendor_type IN ('Fuel', 'Repair', 'Tires', 'Towing', 'Insurance', 'Permit', 'Toll', 'Other')
  ),
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'US',
  tax_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_vendors_vendor_name ON mdata.vendors (vendor_name);
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_code ON mdata.vendors (vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_type ON mdata.vendors (vendor_type);

CREATE TABLE IF NOT EXISTS mdata.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  location_code text UNIQUE,
  location_type text NOT NULL CHECK (
    location_type IN ('Customer', 'Vendor', 'IH35Yard', 'TruckStop', 'Other')
  ),
  linked_customer_id uuid REFERENCES mdata.customers(id),
  linked_vendor_id uuid REFERENCES mdata.vendors(id),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'US',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  hours_of_operation text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_locations_location_name ON mdata.locations (location_name);
CREATE INDEX IF NOT EXISTS idx_locations_location_code ON mdata.locations (location_code);
CREATE INDEX IF NOT EXISTS idx_locations_location_type ON mdata.locations (location_type);
CREATE INDEX IF NOT EXISTS idx_locations_linked_customer_id ON mdata.locations (linked_customer_id);
CREATE INDEX IF NOT EXISTS idx_locations_linked_vendor_id ON mdata.locations (linked_vendor_id);

CREATE TABLE IF NOT EXISTS mdata.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_number text NOT NULL UNIQUE,
  vin text UNIQUE,
  equipment_type text NOT NULL CHECK (
    equipment_type IN ('DryVan', 'Reefer', 'Flatbed', 'Tanker', 'Container', 'Chassis', 'StepDeck', 'Lowboy')
  ),
  make text,
  model text,
  year int,
  license_plate text,
  license_state text,
  status mdata.equipment_status NOT NULL DEFAULT 'InService',
  current_unit_id uuid REFERENCES mdata.units(id),
  current_location_id uuid REFERENCES mdata.locations(id),
  acquired_date date,
  disposed_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_equipment_equipment_number ON mdata.equipment (equipment_number);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON mdata.equipment (status);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON mdata.equipment (equipment_type);
CREATE INDEX IF NOT EXISTS idx_equipment_current_unit_id ON mdata.equipment (current_unit_id);
CREATE INDEX IF NOT EXISTS idx_equipment_current_location_id ON mdata.equipment (current_location_id);

CREATE TABLE IF NOT EXISTS mdata.equipment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id),
  event_type text NOT NULL CHECK (
    event_type IN ('Coupled', 'Uncoupled', 'Moved', 'StatusChange', 'MaintenanceStart', 'MaintenanceEnd', 'Note')
  ),
  from_unit_id uuid REFERENCES mdata.units(id),
  to_unit_id uuid REFERENCES mdata.units(id),
  from_location_id uuid REFERENCES mdata.locations(id),
  to_location_id uuid REFERENCES mdata.locations(id),
  status_before mdata.equipment_status,
  status_after mdata.equipment_status,
  event_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_equipment_log_equipment_event_at
  ON mdata.equipment_log (equipment_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_log_event_type
  ON mdata.equipment_log (event_type);

ALTER TABLE mdata.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.units FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.locations FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.equipment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.equipment_log FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.drivers TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.units TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.customers TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.vendors TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.locations TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.equipment TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.equipment_log TO ih35_app;

DROP POLICY IF EXISTS drivers_select ON mdata.drivers;
CREATE POLICY drivers_select
ON mdata.drivers
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS drivers_insert ON mdata.drivers;
CREATE POLICY drivers_insert
ON mdata.drivers
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS drivers_update ON mdata.drivers;
CREATE POLICY drivers_update
ON mdata.drivers
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS units_select ON mdata.units;
CREATE POLICY units_select
ON mdata.units
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS units_insert ON mdata.units;
CREATE POLICY units_insert
ON mdata.units
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS units_update ON mdata.units;
CREATE POLICY units_update
ON mdata.units
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS customers_select ON mdata.customers;
CREATE POLICY customers_select
ON mdata.customers
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS customers_insert ON mdata.customers;
CREATE POLICY customers_insert
ON mdata.customers
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS customers_update ON mdata.customers;
CREATE POLICY customers_update
ON mdata.customers
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS vendors_select ON mdata.vendors;
CREATE POLICY vendors_select
ON mdata.vendors
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS vendors_insert ON mdata.vendors;
CREATE POLICY vendors_insert
ON mdata.vendors
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS vendors_update ON mdata.vendors;
CREATE POLICY vendors_update
ON mdata.vendors
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS locations_select ON mdata.locations;
CREATE POLICY locations_select
ON mdata.locations
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS locations_insert ON mdata.locations;
CREATE POLICY locations_insert
ON mdata.locations
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS locations_update ON mdata.locations;
CREATE POLICY locations_update
ON mdata.locations
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS equipment_select ON mdata.equipment;
CREATE POLICY equipment_select
ON mdata.equipment
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS equipment_insert ON mdata.equipment;
CREATE POLICY equipment_insert
ON mdata.equipment
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS equipment_update ON mdata.equipment;
CREATE POLICY equipment_update
ON mdata.equipment
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS equipment_log_select ON mdata.equipment_log;
CREATE POLICY equipment_log_select
ON mdata.equipment_log
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS equipment_log_insert ON mdata.equipment_log;
CREATE POLICY equipment_log_insert
ON mdata.equipment_log
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP POLICY IF EXISTS equipment_log_update ON mdata.equipment_log;
CREATE POLICY equipment_log_update
ON mdata.equipment_log
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
);

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON mdata.drivers;
CREATE TRIGGER trg_drivers_updated_at
BEFORE UPDATE ON mdata.drivers
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_units_updated_at ON mdata.units;
CREATE TRIGGER trg_units_updated_at
BEFORE UPDATE ON mdata.units
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON mdata.customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON mdata.customers
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON mdata.vendors;
CREATE TRIGGER trg_vendors_updated_at
BEFORE UPDATE ON mdata.vendors
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_locations_updated_at ON mdata.locations;
CREATE TRIGGER trg_locations_updated_at
BEFORE UPDATE ON mdata.locations
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_equipment_updated_at ON mdata.equipment;
CREATE TRIGGER trg_equipment_updated_at
BEFORE UPDATE ON mdata.equipment
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_equipment_log_updated_at ON mdata.equipment_log;
CREATE TRIGGER trg_equipment_log_updated_at
BEFORE UPDATE ON mdata.equipment_log
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

COMMIT;
