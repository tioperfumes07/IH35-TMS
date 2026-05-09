BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'fuel_card_types',
    'fuel_exception_types',
    'fuel_station_brands',
    'fuel_stop_reason_codes',
    'mpg_bands',
    'fuel_tax_jurisdictions'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS catalogs.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operating_company_id uuid NOT NULL REFERENCES org.companies(id),
        code text NOT NULL,
        display_name text NOT NULL,
        description text,
        metadata jsonb NOT NULL DEFAULT ''{}''::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (operating_company_id, code)
      )',
      tbl
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_company_active ON catalogs.%I (operating_company_id, is_active)',
      tbl,
      tbl
    );
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', tbl);
    EXECUTE format(
      'CREATE POLICY company_scope
       ON catalogs.%I
       FOR ALL TO ih35_app
       USING (operating_company_id::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (operating_company_id::text = current_setting(''app.operating_company_id'', true))',
      tbl
    );
  END LOOP;
END
$$;

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

SELECT catalogs.__seed_fuel_catalog(
  'fuel_card_types',
  jsonb_build_array(
    jsonb_build_object('code', 'RELAY', 'display_name', 'Relay card', 'description', 'Relay issued fuel card', 'metadata', jsonb_build_object('network', 'RELAY', 'credit_limit_cents', 500000), 'sort_order', 10),
    jsonb_build_object('code', 'EFS', 'display_name', 'EFS card', 'description', 'EFS fleet card', 'metadata', jsonb_build_object('network', 'EFS', 'credit_limit_cents', 450000), 'sort_order', 20),
    jsonb_build_object('code', 'COMDATA', 'display_name', 'Comdata card', 'description', 'Comdata fuel program card', 'metadata', jsonb_build_object('network', 'COMDATA', 'credit_limit_cents', 450000), 'sort_order', 30),
    jsonb_build_object('code', 'WEX', 'display_name', 'WEX card', 'description', 'WEX fleet fueling card', 'metadata', jsonb_build_object('network', 'WEX', 'credit_limit_cents', 450000), 'sort_order', 40),
    jsonb_build_object('code', 'CASH', 'display_name', 'Cash fallback', 'description', 'Manual cash reimbursement fallback', 'metadata', jsonb_build_object('network', 'MANUAL', 'credit_limit_cents', 100000), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_fuel_catalog(
  'fuel_exception_types',
  jsonb_build_array(
    jsonb_build_object('code', 'PRICE-SPIKE', 'display_name', 'Price spike', 'description', 'Pump price exceeds expected threshold', 'metadata', jsonb_build_object('alert_level', 'warning'), 'sort_order', 10),
    jsonb_build_object('code', 'OFF-NETWORK', 'display_name', 'Off-network purchase', 'description', 'Fuel purchase at non-preferred station', 'metadata', jsonb_build_object('alert_level', 'warning'), 'sort_order', 20),
    jsonb_build_object('code', 'ODOMETER-MISMATCH', 'display_name', 'Odometer mismatch', 'description', 'Mileage does not align with fueling pattern', 'metadata', jsonb_build_object('alert_level', 'critical'), 'sort_order', 30),
    jsonb_build_object('code', 'HIGH-GALLONS', 'display_name', 'High gallons', 'description', 'Gallons exceed expected tank capacity', 'metadata', jsonb_build_object('alert_level', 'critical'), 'sort_order', 40),
    jsonb_build_object('code', 'MULTI-SWIPE', 'display_name', 'Multiple swipes', 'description', 'Multiple same-day card swipes detected', 'metadata', jsonb_build_object('alert_level', 'warning'), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_fuel_catalog(
  'fuel_station_brands',
  jsonb_build_array(
    jsonb_build_object('code', 'PILOT', 'display_name', 'Pilot', 'description', 'Pilot Travel Centers', 'metadata', jsonb_build_object('relay_partner', true), 'sort_order', 10),
    jsonb_build_object('code', 'LOVES', 'display_name', 'Love''s', 'description', 'Love''s Travel Stops', 'metadata', jsonb_build_object('relay_partner', true), 'sort_order', 20),
    jsonb_build_object('code', 'TA-PETRO', 'display_name', 'TA Petro', 'description', 'TravelCenters/Petro network', 'metadata', jsonb_build_object('relay_partner', true), 'sort_order', 30),
    jsonb_build_object('code', 'FLYING-J', 'display_name', 'Flying J', 'description', 'Flying J branded locations', 'metadata', jsonb_build_object('relay_partner', true), 'sort_order', 40),
    jsonb_build_object('code', 'SPEEDWAY', 'display_name', 'Speedway', 'description', 'Regional Speedway network', 'metadata', jsonb_build_object('relay_partner', false), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_fuel_catalog(
  'fuel_stop_reason_codes',
  jsonb_build_array(
    jsonb_build_object('code', 'LOW-TANK', 'display_name', 'Low tank threshold', 'description', 'Stop triggered by minimum tank level', 'metadata', jsonb_build_object('trigger_type', 'tank_level'), 'sort_order', 10),
    jsonb_build_object('code', 'ROUTE-OPT', 'display_name', 'Route optimization', 'description', 'Planner-selected optimal price stop', 'metadata', jsonb_build_object('trigger_type', 'optimization'), 'sort_order', 20),
    jsonb_build_object('code', 'MANDATED', 'display_name', 'Mandated stop', 'description', 'Stop required by dispatch policy', 'metadata', jsonb_build_object('trigger_type', 'policy'), 'sort_order', 30),
    jsonb_build_object('code', 'REST-BREAK', 'display_name', 'Rest break overlap', 'description', 'Fuel stop paired with required rest break', 'metadata', jsonb_build_object('trigger_type', 'hos_overlap'), 'sort_order', 40),
    jsonb_build_object('code', 'EXCEPTION', 'display_name', 'Exception override', 'description', 'Manual override from planner exception', 'metadata', jsonb_build_object('trigger_type', 'manual'), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_fuel_catalog(
  'mpg_bands',
  jsonb_build_array(
    jsonb_build_object('code', 'BAND-A', 'display_name', 'Band A (6.0+ MPG)', 'description', 'Highest efficiency range', 'metadata', jsonb_build_object('min_mpg', 6.0, 'max_mpg', 9.9), 'sort_order', 10),
    jsonb_build_object('code', 'BAND-B', 'display_name', 'Band B (5.5-5.99 MPG)', 'description', 'Good efficiency range', 'metadata', jsonb_build_object('min_mpg', 5.5, 'max_mpg', 5.99), 'sort_order', 20),
    jsonb_build_object('code', 'BAND-C', 'display_name', 'Band C (5.0-5.49 MPG)', 'description', 'Average efficiency range', 'metadata', jsonb_build_object('min_mpg', 5.0, 'max_mpg', 5.49), 'sort_order', 30),
    jsonb_build_object('code', 'BAND-D', 'display_name', 'Band D (4.5-4.99 MPG)', 'description', 'Below target efficiency', 'metadata', jsonb_build_object('min_mpg', 4.5, 'max_mpg', 4.99), 'sort_order', 40),
    jsonb_build_object('code', 'BAND-E', 'display_name', 'Band E (<4.5 MPG)', 'description', 'Critical low efficiency', 'metadata', jsonb_build_object('min_mpg', 0.0, 'max_mpg', 4.49), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_fuel_catalog(
  'fuel_tax_jurisdictions',
  jsonb_build_array(
    jsonb_build_object('code', 'US-TX', 'display_name', 'Texas', 'description', 'US fuel tax jurisdiction', 'metadata', jsonb_build_object('jurisdiction_code', 'US-TX', 'country', 'US'), 'sort_order', 10),
    jsonb_build_object('code', 'US-CA', 'display_name', 'California', 'description', 'US fuel tax jurisdiction', 'metadata', jsonb_build_object('jurisdiction_code', 'US-CA', 'country', 'US'), 'sort_order', 20),
    jsonb_build_object('code', 'US-IL', 'display_name', 'Illinois', 'description', 'US fuel tax jurisdiction', 'metadata', jsonb_build_object('jurisdiction_code', 'US-IL', 'country', 'US'), 'sort_order', 30),
    jsonb_build_object('code', 'US-NY', 'display_name', 'New York', 'description', 'US fuel tax jurisdiction', 'metadata', jsonb_build_object('jurisdiction_code', 'US-NY', 'country', 'US'), 'sort_order', 40),
    jsonb_build_object('code', 'CA-ON', 'display_name', 'Ontario', 'description', 'Canada fuel tax jurisdiction', 'metadata', jsonb_build_object('jurisdiction_code', 'CA-ON', 'country', 'CA'), 'sort_order', 50)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_fuel_catalog(text, jsonb);

COMMIT;
