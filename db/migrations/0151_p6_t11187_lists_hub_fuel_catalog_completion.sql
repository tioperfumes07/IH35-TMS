BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

-- Company-scoped fuel catalogs (T11.21.6A completion)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['fuel_brands', 'fuel_station_states', 'fuel_pump_types', 'fuel_dispatch_routes']
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

CREATE OR REPLACE FUNCTION catalogs.__seed_fuel_company_catalog(p_table text, p_entries jsonb)
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

SELECT catalogs.__seed_fuel_company_catalog(
  'fuel_brands',
  jsonb_build_array(
    jsonb_build_object('code', 'RELAY-NET', 'display_name', 'Relay network fuel brand', 'description', 'Relay preferred partner', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'MAJOR7', 'display_name', 'National truck stop brand', 'description', 'Large chain brand bucket', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'INDEP', 'display_name', 'Independent station', 'description', 'Non-chain / local station', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

SELECT catalogs.__seed_fuel_company_catalog(
  'fuel_station_states',
  jsonb_build_array(
    jsonb_build_object('code', 'TX', 'display_name', 'Texas', 'description', 'Station operations baseline — TX', 'metadata', jsonb_build_object('country', 'US'), 'sort_order', 10),
    jsonb_build_object('code', 'OK', 'display_name', 'Oklahoma', 'description', 'Station operations baseline — OK', 'metadata', jsonb_build_object('country', 'US'), 'sort_order', 20),
    jsonb_build_object('code', 'CA', 'display_name', 'California', 'description', 'Station operations baseline — CA', 'metadata', jsonb_build_object('country', 'US'), 'sort_order', 30)
  )
);

SELECT catalogs.__seed_fuel_company_catalog(
  'fuel_pump_types',
  jsonb_build_array(
    jsonb_build_object('code', 'ULTRA-HIGH', 'display_name', 'Ultra-high-flow', 'description', 'High-flow commercial diesel nozzle', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'SATELLITE', 'display_name', 'Satellite pump', 'description', 'Secondary / satellite diesel island', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'DEF-ISLAND', 'display_name', 'DEF island', 'description', 'Dedicated DEF dispenser', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

SELECT catalogs.__seed_fuel_company_catalog(
  'fuel_dispatch_routes',
  jsonb_build_array(
    jsonb_build_object('code', 'IH35-NB', 'display_name', 'IH-35 northbound', 'description', 'Primary northbound lane string', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'IH35-SB', 'display_name', 'IH-35 southbound', 'description', 'Primary southbound lane string', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'LOOP-410', 'display_name', 'San Antonio 410 loop', 'description', 'Metro loop routing helper', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_fuel_company_catalog(text, jsonb);

SELECT catalogs.__seed_company_catalog(
  'fuel_grades',
  jsonb_build_array(
    jsonb_build_object('code', 'ULSD', 'display_name', 'ULSD #2', 'description', 'Ultra-low sulfur diesel', 'metadata', jsonb_build_object('api_class', 'diesel'), 'sort_order', 10),
    jsonb_build_object('code', 'DIESEL-MID', 'display_name', 'Diesel mid-grade', 'description', 'Mid-grade diesel catalog row', 'metadata', jsonb_build_object('api_class', 'diesel'), 'sort_order', 20),
    jsonb_build_object('code', 'DEF', 'display_name', 'DEF', 'description', 'Diesel exhaust fluid', 'metadata', jsonb_build_object('api_class', 'def'), 'sort_order', 30)
  )
);

COMMIT;
