BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

-- P6-T11187 — driver list catalogs (Block K completion) + fuel catalog repair
-- Migration 0150 only seeded; production failed with missing pay_rate_templates.
-- Migration 0151 rolled back entirely: it seeds fuel_grades without CREATE TABLE,
-- so catalogs.fuel_brands (and siblings) never persisted.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'pay_rate_templates',
    'driver_pay_types',
    'driver_deduction_types',
    'escrow_types',
    'fuel_brands',
    'fuel_station_states',
    'fuel_pump_types',
    'fuel_dispatch_routes',
    'fuel_grades'
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

-- Driver seeds (same payloads as 0150; idempotent via __seed_company_catalog)
SELECT catalogs.__seed_company_catalog(
  'pay_rate_templates',
  jsonb_build_array(
    jsonb_build_object(
      'code',
      'PER-MILE-EMPTY',
      'display_name',
      'Per-mile empty',
      'description',
      'Empty mile / deadhead rate template',
      'metadata',
      jsonb_build_object('rate', 0.4, 'unit', 'mi'),
      'sort_order',
      60
    ),
    jsonb_build_object(
      'code',
      'PER-DIEM',
      'display_name',
      'Per diem',
      'description',
      'Daily per diem pay template',
      'metadata',
      jsonb_build_object('rate_cents', 7500, 'unit', 'day'),
      'sort_order',
      70
    )
  )
);

SELECT catalogs.__seed_company_catalog(
  'driver_pay_types',
  jsonb_build_array(
    jsonb_build_object(
      'code',
      'EXTRA-STOP',
      'display_name',
      'Extra stop pay',
      'description',
      'Additional stop compensation',
      'metadata',
      '{}'::jsonb,
      'sort_order',
      60
    ),
    jsonb_build_object(
      'code',
      'TONU',
      'display_name',
      'TONU',
      'description',
      'Truck ordered not used',
      'metadata',
      '{}'::jsonb,
      'sort_order',
      70
    )
  )
);

SELECT catalogs.__seed_company_catalog(
  'driver_deduction_types',
  jsonb_build_array(
    jsonb_build_object(
      'code',
      'INS-DED',
      'display_name',
      'Insurance deduction',
      'description',
      'Insurance / OCCACC deduction bucket',
      'metadata',
      '{}'::jsonb,
      'sort_order',
      60
    )
  )
);

SELECT catalogs.__seed_company_catalog(
  'escrow_types',
  jsonb_build_array(
    jsonb_build_object(
      'code',
      'INSURANCE-DEP',
      'display_name',
      'Insurance deposit',
      'description',
      'Insurance escrow deposit',
      'metadata',
      jsonb_build_object('target_amount_cents', 75000),
      'sort_order',
      60
    )
  )
);

-- Fuel seeds (same payloads as 0151; idempotent)
SELECT catalogs.__seed_company_catalog(
  'fuel_brands',
  jsonb_build_array(
    jsonb_build_object('code', 'RELAY-NET', 'display_name', 'Relay network fuel brand', 'description', 'Relay preferred partner', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'MAJOR7', 'display_name', 'National truck stop brand', 'description', 'Large chain brand bucket', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'INDEP', 'display_name', 'Independent station', 'description', 'Non-chain / local station', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

SELECT catalogs.__seed_company_catalog(
  'fuel_station_states',
  jsonb_build_array(
    jsonb_build_object('code', 'TX', 'display_name', 'Texas', 'description', 'Station operations baseline — TX', 'metadata', jsonb_build_object('country', 'US'), 'sort_order', 10),
    jsonb_build_object('code', 'OK', 'display_name', 'Oklahoma', 'description', 'Station operations baseline — OK', 'metadata', jsonb_build_object('country', 'US'), 'sort_order', 20),
    jsonb_build_object('code', 'CA', 'display_name', 'California', 'description', 'Station operations baseline — CA', 'metadata', jsonb_build_object('country', 'US'), 'sort_order', 30)
  )
);

SELECT catalogs.__seed_company_catalog(
  'fuel_pump_types',
  jsonb_build_array(
    jsonb_build_object('code', 'ULTRA-HIGH', 'display_name', 'Ultra-high-flow', 'description', 'High-flow commercial diesel nozzle', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'SATELLITE', 'display_name', 'Satellite pump', 'description', 'Secondary / satellite diesel island', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'DEF-ISLAND', 'display_name', 'DEF island', 'description', 'Dedicated DEF dispenser', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

SELECT catalogs.__seed_company_catalog(
  'fuel_dispatch_routes',
  jsonb_build_array(
    jsonb_build_object('code', 'IH35-NB', 'display_name', 'IH-35 northbound', 'description', 'Primary northbound lane string', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'IH35-SB', 'display_name', 'IH-35 southbound', 'description', 'Primary southbound lane string', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'LOOP-410', 'display_name', 'San Antonio 410 loop', 'description', 'Metro loop routing helper', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

SELECT catalogs.__seed_company_catalog(
  'fuel_grades',
  jsonb_build_array(
    jsonb_build_object('code', 'ULSD', 'display_name', 'ULSD #2', 'description', 'Ultra-low sulfur diesel', 'metadata', jsonb_build_object('api_class', 'diesel'), 'sort_order', 10),
    jsonb_build_object('code', 'DIESEL-MID', 'display_name', 'Diesel mid-grade', 'description', 'Mid-grade diesel catalog row', 'metadata', jsonb_build_object('api_class', 'diesel'), 'sort_order', 20),
    jsonb_build_object('code', 'DEF', 'display_name', 'DEF', 'description', 'Diesel exhaust fluid', 'metadata', jsonb_build_object('api_class', 'def'), 'sort_order', 30)
  )
);

COMMIT;
