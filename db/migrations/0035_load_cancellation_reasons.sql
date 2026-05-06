BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'catalogs'::regnamespace
      AND typname = 'cancellation_category_enum'
  ) THEN
    CREATE TYPE catalogs.cancellation_category_enum AS ENUM (
      'customer_initiated',
      'carrier_initiated',
      'force_majeure',
      'other'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS catalogs.load_cancellation_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  reason_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category catalogs.cancellation_category_enum NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 100,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  UNIQUE (operating_company_id, reason_code)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_reasons_company_active
  ON catalogs.load_cancellation_reasons (operating_company_id, is_active, sort_order);

ALTER TABLE catalogs.load_cancellation_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cancellation_reasons_select ON catalogs.load_cancellation_reasons;
CREATE POLICY cancellation_reasons_select ON catalogs.load_cancellation_reasons
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS cancellation_reasons_insert ON catalogs.load_cancellation_reasons;
CREATE POLICY cancellation_reasons_insert ON catalogs.load_cancellation_reasons
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum
      ]
    )
  );

DROP POLICY IF EXISTS cancellation_reasons_update ON catalogs.load_cancellation_reasons;
CREATE POLICY cancellation_reasons_update ON catalogs.load_cancellation_reasons
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum
      ]
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum
      ]
    )
  );

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.load_cancellation_reasons TO ih35_app;

DROP TRIGGER IF EXISTS trg_cancellation_reasons_updated_at ON catalogs.load_cancellation_reasons;
CREATE TRIGGER trg_cancellation_reasons_updated_at
  BEFORE UPDATE ON catalogs.load_cancellation_reasons
  FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

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

COMMIT;
