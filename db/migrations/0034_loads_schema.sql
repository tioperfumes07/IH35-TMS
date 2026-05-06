BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'mdata'::regnamespace AND typname = 'load_status_enum') THEN
    CREATE TYPE mdata.load_status_enum AS ENUM (
      'draft', 'booked', 'planned', 'assigned', 'dispatched',
      'at_pickup', 'in_transit', 'at_delivery', 'delivered',
      'invoiced', 'paid', 'closed', 'cancelled'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'mdata'::regnamespace AND typname = 'stop_type_enum') THEN
    CREATE TYPE mdata.stop_type_enum AS ENUM (
      'pickup', 'delivery', 'fuel', 'rest', 'border'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'mdata'::regnamespace AND typname = 'stop_status_enum') THEN
    CREATE TYPE mdata.stop_status_enum AS ENUM (
      'pending', 'arrived', 'departed', 'cancelled'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mdata.loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES mdata.customers(id),
  status mdata.load_status_enum NOT NULL DEFAULT 'draft',
  rate_total_cents BIGINT NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD' CHECK (currency_code IN ('USD', 'MXN')),
  assigned_unit_id UUID REFERENCES mdata.units(id),
  assigned_primary_driver_id UUID REFERENCES mdata.drivers(id),
  assigned_secondary_driver_id UUID REFERENCES mdata.drivers(id),
  dispatcher_user_id UUID NOT NULL REFERENCES identity.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  soft_deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES identity.users(id),
  UNIQUE (operating_company_id, load_number)
);

CREATE INDEX IF NOT EXISTS idx_loads_company_status
  ON mdata.loads (operating_company_id, status)
  WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loads_customer ON mdata.loads (customer_id);
CREATE INDEX IF NOT EXISTS idx_loads_unit ON mdata.loads (assigned_unit_id) WHERE assigned_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loads_driver_primary ON mdata.loads (assigned_primary_driver_id) WHERE assigned_primary_driver_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mdata.load_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL,
  stop_type mdata.stop_type_enum NOT NULL,
  location_id UUID REFERENCES mdata.locations(id),
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  scheduled_arrival_at TIMESTAMPTZ,
  scheduled_departure_at TIMESTAMPTZ,
  actual_arrival_at TIMESTAMPTZ,
  actual_departure_at TIMESTAMPTZ,
  status mdata.stop_status_enum NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (load_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_load_stops_load ON mdata.load_stops (load_id);

ALTER TABLE mdata.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.load_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loads_select_office ON mdata.loads;
CREATE POLICY loads_select_office ON mdata.loads
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
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS loads_select_driver ON mdata.loads;
CREATE POLICY loads_select_driver ON mdata.loads
  FOR SELECT TO ih35_app
  USING (
    EXISTS (
      SELECT 1 FROM mdata.drivers d
      WHERE d.identity_user_id = identity.current_user_id()
        AND (d.id = mdata.loads.assigned_primary_driver_id OR d.id = mdata.loads.assigned_secondary_driver_id)
    )
  );

DROP POLICY IF EXISTS loads_insert_office ON mdata.loads;
CREATE POLICY loads_insert_office ON mdata.loads
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

DROP POLICY IF EXISTS loads_update_office ON mdata.loads;
CREATE POLICY loads_update_office ON mdata.loads
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

DROP POLICY IF EXISTS load_stops_select ON mdata.load_stops;
CREATE POLICY load_stops_select ON mdata.load_stops
  FOR SELECT TO ih35_app
  USING (
    EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = mdata.load_stops.load_id)
  );

DROP POLICY IF EXISTS load_stops_insert ON mdata.load_stops;
CREATE POLICY load_stops_insert ON mdata.load_stops
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

DROP POLICY IF EXISTS load_stops_update ON mdata.load_stops;
CREATE POLICY load_stops_update ON mdata.load_stops
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

GRANT SELECT, INSERT, UPDATE ON mdata.loads TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.load_stops TO ih35_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'mdata'
      AND p.proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION mdata.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_loads_updated_at ON mdata.loads;
CREATE TRIGGER trg_loads_updated_at
BEFORE UPDATE ON mdata.loads
FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

DROP TRIGGER IF EXISTS trg_load_stops_updated_at ON mdata.load_stops;
CREATE TRIGGER trg_load_stops_updated_at
BEFORE UPDATE ON mdata.load_stops
FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

COMMIT;
