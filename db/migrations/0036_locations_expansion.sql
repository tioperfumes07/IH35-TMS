BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'mdata'::regnamespace
      AND typname = 'location_type_enum'
  ) THEN
    CREATE TYPE mdata.location_type_enum AS ENUM (
      'customer_warehouse',
      'customer_terminal',
      'shipper_facility',
      'consignee_facility',
      'distribution_center',
      'cross_dock',
      'port',
      'rail_terminal',
      'fuel_stop',
      'truck_stop',
      'rest_area',
      'border_crossing',
      'customs_broker',
      'mechanic_shop',
      'tire_shop',
      'wash_facility',
      'scale',
      'yard',
      'office',
      'other'
    );
  END IF;
END
$$;

ALTER TABLE mdata.locations
  DROP CONSTRAINT IF EXISTS locations_location_type_check;

ALTER TABLE mdata.locations
  ALTER COLUMN location_type DROP DEFAULT;

ALTER TABLE mdata.locations
  ALTER COLUMN location_type TYPE mdata.location_type_enum USING (
    CASE location_type::text
      WHEN 'Customer' THEN 'customer_warehouse'
      WHEN 'Vendor' THEN 'shipper_facility'
      WHEN 'IH35Yard' THEN 'yard'
      WHEN 'TruckStop' THEN 'truck_stop'
      WHEN 'Other' THEN 'other'
      WHEN 'customer_warehouse' THEN 'customer_warehouse'
      WHEN 'customer_terminal' THEN 'customer_terminal'
      WHEN 'shipper_facility' THEN 'shipper_facility'
      WHEN 'consignee_facility' THEN 'consignee_facility'
      WHEN 'distribution_center' THEN 'distribution_center'
      WHEN 'cross_dock' THEN 'cross_dock'
      WHEN 'port' THEN 'port'
      WHEN 'rail_terminal' THEN 'rail_terminal'
      WHEN 'fuel_stop' THEN 'fuel_stop'
      WHEN 'truck_stop' THEN 'truck_stop'
      WHEN 'rest_area' THEN 'rest_area'
      WHEN 'border_crossing' THEN 'border_crossing'
      WHEN 'customs_broker' THEN 'customs_broker'
      WHEN 'mechanic_shop' THEN 'mechanic_shop'
      WHEN 'tire_shop' THEN 'tire_shop'
      WHEN 'wash_facility' THEN 'wash_facility'
      WHEN 'scale' THEN 'scale'
      WHEN 'yard' THEN 'yard'
      WHEN 'office' THEN 'office'
      WHEN 'other' THEN 'other'
      ELSE 'other'
    END
  )::mdata.location_type_enum,
  ALTER COLUMN location_type SET NOT NULL,
  ALTER COLUMN location_type SET DEFAULT 'other';

ALTER TABLE mdata.locations
  ALTER COLUMN latitude TYPE numeric(10, 7),
  ALTER COLUMN longitude TYPE numeric(10, 7);

ALTER TABLE mdata.locations
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocoding_source TEXT,
  ADD COLUMN IF NOT EXISTS hours_of_operation_jsonb JSONB,
  ADD COLUMN IF NOT EXISTS dock_count INT,
  ADD COLUMN IF NOT EXISTS appointment_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS appointment_lead_time_hours INT,
  ADD COLUMN IF NOT EXISTS dock_high BOOLEAN,
  ADD COLUMN IF NOT EXISTS power_only_friendly BOOLEAN,
  ADD COLUMN IF NOT EXISTS drop_trailer_friendly BOOLEAN,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS security_instructions TEXT,
  ADD COLUMN IF NOT EXISTS dock_instructions TEXT,
  ADD COLUMN IF NOT EXISTS parking_instructions TEXT;

DROP INDEX IF EXISTS mdata.idx_locations_location_type;
CREATE INDEX IF NOT EXISTS idx_locations_type ON mdata.locations (location_type);
CREATE INDEX IF NOT EXISTS idx_locations_geocoded
  ON mdata.locations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

DROP POLICY IF EXISTS locations_select ON mdata.locations;
CREATE POLICY locations_select ON mdata.locations
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum,
        'Safety'::identity.role_enum,
        'Accountant'::identity.role_enum
      ]
    )
    AND deactivated_at IS NULL
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
  OR (
    identity.current_user_role() = 'Driver'
    AND deactivated_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM mdata.load_stops ls
      JOIN mdata.loads l ON l.id = ls.load_id
      JOIN mdata.drivers d ON d.identity_user_id = identity.current_user_id()
      WHERE ls.location_id = mdata.locations.id
        AND (
          d.id = l.assigned_primary_driver_id
          OR d.id = l.assigned_secondary_driver_id
        )
        AND l.soft_deleted_at IS NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS mdata.location_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  location_id UUID NOT NULL REFERENCES mdata.locations(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_location_contacts_location
  ON mdata.location_contacts (location_id)
  WHERE is_active = true;

ALTER TABLE mdata.location_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS location_contacts_select ON mdata.location_contacts;
CREATE POLICY location_contacts_select ON mdata.location_contacts
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum,
        'Safety'::identity.role_enum,
        'Accountant'::identity.role_enum
      ]
    )
    AND operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  )
  OR (
    identity.current_user_role() = 'Driver'
    AND EXISTS (
      SELECT 1
      FROM mdata.locations loc
      JOIN mdata.load_stops ls ON ls.location_id = loc.id
      JOIN mdata.loads l ON l.id = ls.load_id
      JOIN mdata.drivers d ON d.identity_user_id = identity.current_user_id()
      WHERE loc.id = mdata.location_contacts.location_id
        AND (
          d.id = l.assigned_primary_driver_id
          OR d.id = l.assigned_secondary_driver_id
        )
        AND l.soft_deleted_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS location_contacts_insert ON mdata.location_contacts;
CREATE POLICY location_contacts_insert ON mdata.location_contacts
FOR INSERT TO ih35_app
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() = ANY (
    ARRAY[
      'Owner'::identity.role_enum,
      'Administrator'::identity.role_enum,
      'Manager'::identity.role_enum,
      'Dispatcher'::identity.role_enum
    ]
  )
);

DROP POLICY IF EXISTS location_contacts_update ON mdata.location_contacts;
CREATE POLICY location_contacts_update ON mdata.location_contacts
FOR UPDATE TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() = ANY (
    ARRAY[
      'Owner'::identity.role_enum,
      'Administrator'::identity.role_enum,
      'Manager'::identity.role_enum,
      'Dispatcher'::identity.role_enum
    ]
  )
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() = ANY (
    ARRAY[
      'Owner'::identity.role_enum,
      'Administrator'::identity.role_enum,
      'Manager'::identity.role_enum,
      'Dispatcher'::identity.role_enum
    ]
  )
);

GRANT SELECT, INSERT, UPDATE ON mdata.location_contacts TO ih35_app;

DROP TRIGGER IF EXISTS trg_location_contacts_updated_at ON mdata.location_contacts;
CREATE TRIGGER trg_location_contacts_updated_at
BEFORE UPDATE ON mdata.location_contacts
FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

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

COMMIT;
