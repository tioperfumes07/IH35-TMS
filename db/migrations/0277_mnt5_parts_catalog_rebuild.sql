BEGIN;

WITH raw_samsara_fleet AS (
  SELECT
    sv.operating_company_id AS tenant_id,
    sv.samsara_vehicle_id,
    UPPER(NULLIF(TRIM(sv.raw_payload->>'name'), '')) AS unit_name,
    NULLIF(TRIM(sv.raw_payload->>'vin'), '') AS vin,
    UPPER(COALESCE(NULLIF(TRIM(sv.raw_payload->>'make'), ''), 'UNKNOWN')) AS make,
    NULLIF(TRIM(sv.raw_payload->>'model'), '') AS model,
    CASE
      WHEN NULLIF(TRIM(sv.raw_payload->>'year'), '') ~ '^\d{4}$'
        THEN (sv.raw_payload->>'year')::INT
      ELSE NULL
    END AS year,
    sv.updated_at,
    sv.created_at
  FROM integrations.samsara_vehicles sv
  WHERE sv.operating_company_id IS NOT NULL
    AND sv.raw_payload IS NOT NULL
    AND UPPER(COALESCE(sv.raw_payload->>'name', '')) ~ '^T(12[0-9]|1[3-6][0-9]|17[0-7])$'
),
fleet_profiles AS (
  SELECT
    ranked.tenant_id,
    ranked.samsara_vehicle_id,
    ranked.unit_name,
    ranked.vin,
    ranked.make,
    COALESCE(ranked.model, 'UNKNOWN') AS model,
    ranked.year
  FROM (
    SELECT
      rsf.*,
      ROW_NUMBER() OVER (
        PARTITION BY rsf.tenant_id, rsf.unit_name
        ORDER BY
          (rsf.year IS NOT NULL) DESC,
          rsf.updated_at DESC NULLS LAST,
          rsf.created_at DESC NULLS LAST,
          rsf.samsara_vehicle_id DESC
      ) AS rn
    FROM raw_samsara_fleet rsf
  ) ranked
  WHERE ranked.rn = 1
),
fleet_tenants AS (
  SELECT DISTINCT fp.tenant_id
  FROM fleet_profiles fp
),
fleet_make_model_years AS (
  SELECT DISTINCT
    fp.make,
    fp.model,
    fp.year,
    regexp_replace(fp.make, '[^A-Z0-9]+', '_', 'g') AS make_slug,
    regexp_replace(UPPER(fp.model), '[^A-Z0-9]+', '_', 'g') AS model_slug
  FROM fleet_profiles fp
),
supersede_tenants AS (
  SELECT tenant_id FROM fleet_tenants
  UNION
  SELECT DISTINCT p.tenant_id
  FROM maint.part p
  WHERE p.tenant_id IS NOT NULL
    AND p.sku LIKE ANY (ARRAY['CAT-%', 'UNI-%', 'MK-%', 'MMY-%'])
),
purge_seed_parts AS (
  DELETE FROM maint.part p
  USING supersede_tenants st
  WHERE p.tenant_id = st.tenant_id
    AND p.sku LIKE ANY (ARRAY['CAT-%', 'UNI-%', 'MK-%', 'MMY-%'])
  RETURNING p.id
),
upsert_assets AS (
  INSERT INTO mdata.assets (
    tenant_id,
    unit_code,
    asset_type,
    vin,
    make,
    model,
    year,
    status,
    samsara_unit_id,
    owning_entity
  )
  SELECT
    fp.tenant_id,
    fp.unit_name AS unit_code,
    CASE
      WHEN fp.make IN ('PETERBILT', 'MACK', 'FREIGHTLINER', 'VOLVO TRUCK', 'KENWORTH', 'INTERNATIONAL')
        THEN 'tractor'
      ELSE 'personnel_vehicle'
    END AS asset_type,
    fp.vin,
    fp.make,
    fp.model,
    fp.year,
    'active' AS status,
    fp.samsara_vehicle_id AS samsara_unit_id,
    'TRK' AS owning_entity
  FROM fleet_profiles fp
  ON CONFLICT (tenant_id, unit_code)
  DO UPDATE SET
    asset_type = EXCLUDED.asset_type,
    vin = EXCLUDED.vin,
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    year = EXCLUDED.year,
    status = EXCLUDED.status,
    samsara_unit_id = EXCLUDED.samsara_unit_id,
    updated_at = NOW()
  RETURNING id
),
fleet_assets AS (
  SELECT
    a.id AS asset_id,
    a.tenant_id,
    fp.make,
    fp.model,
    fp.year
  FROM fleet_profiles fp
  JOIN mdata.assets a
    ON a.tenant_id = fp.tenant_id
   AND a.unit_code = fp.unit_name
),
common_parts AS (
  SELECT *
  FROM (
    VALUES
      ('UNI-ENG-OIL-15W40', 'Engine Oil 15W-40 (1 gal)', 'engine_lubrication', 3800, 240, 120),
      ('UNI-ENG-OIL-10W30', 'Engine Oil 10W-30 (1 gal)', 'engine_lubrication', 3600, 120, 60),
      ('UNI-ENG-OIL-FLTR-P', 'Engine Oil Filter Primary', 'engine_lubrication', 2100, 120, 60),
      ('UNI-ENG-OIL-FLTR-S', 'Engine Oil Filter Secondary', 'engine_lubrication', 1950, 120, 60),
      ('UNI-FUEL-FLTR-P', 'Fuel Filter Primary', 'fuel_system', 2600, 120, 50),
      ('UNI-FUEL-FLTR-S', 'Fuel Filter Secondary', 'fuel_system', 2750, 120, 50),
      ('UNI-FUEL-WATER-SEP', 'Fuel Water Separator', 'fuel_system', 2950, 80, 40),
      ('UNI-FUEL-PRIME-PUMP', 'Fuel Primer Pump Kit', 'fuel_system', 8700, 20, 8),
      ('UNI-AIR-FLTR-MAIN', 'Engine Air Filter Main', 'air_intake', 6200, 60, 24),
      ('UNI-AIR-FLTR-SAFE', 'Engine Air Filter Safety', 'air_intake', 4300, 60, 24),
      ('UNI-AIR-FLTR-CABIN', 'Cabin Air Filter', 'cab_hvac', 3000, 90, 36),
      ('UNI-DEF-FLTR-KIT', 'DEF Filter Kit', 'emissions', 9800, 48, 18),
      ('UNI-DEF-INJECTOR', 'DEF Injector', 'emissions', 24500, 20, 8),
      ('UNI-DEF-DOSER-GASK', 'DEF Doser Gasket Set', 'emissions', 2400, 40, 16),
      ('UNI-DPF-CLAMP-BAND', 'DPF Clamp Band', 'emissions', 4800, 40, 16),
      ('UNI-NOX-SENSOR-UP', 'NOx Sensor Upstream', 'emissions', 19800, 24, 10),
      ('UNI-NOX-SENSOR-DN', 'NOx Sensor Downstream', 'emissions', 19800, 24, 10),
      ('UNI-COOLANT-OAT', 'Extended Life Coolant OAT (1 gal)', 'cooling', 2900, 120, 50),
      ('UNI-COOLANT-FLTR', 'Coolant Filter', 'cooling', 2500, 64, 24),
      ('UNI-THERMOSTAT-KIT', 'Thermostat Service Kit', 'cooling', 9200, 20, 8),
      ('UNI-HOSE-UPPER-RAD', 'Radiator Hose Upper', 'cooling', 3700, 32, 12),
      ('UNI-HOSE-LOWER-RAD', 'Radiator Hose Lower', 'cooling', 3700, 32, 12),
      ('UNI-BELT-SERP-HD', 'Serpentine Belt HD', 'engine_accessories', 9900, 40, 16),
      ('UNI-BELT-TENSIONER', 'Belt Tensioner Assembly', 'engine_accessories', 14900, 20, 8),
      ('UNI-TRANS-FLUID-PS386', 'Transmission Fluid PS-386 (1 gal)', 'transmission', 5900, 80, 30),
      ('UNI-TRANS-FLTR-KIT', 'Transmission Filter Kit', 'transmission', 13500, 36, 14),
      ('UNI-TRANS-PAN-GASK', 'Transmission Pan Gasket', 'transmission', 3400, 36, 14),
      ('UNI-DIFF-FLUID-75W90', 'Differential Fluid 75W-90 (1 gal)', 'driveline', 4900, 80, 30),
      ('UNI-DIFF-GASK-KIT', 'Differential Gasket Kit', 'driveline', 2600, 40, 16),
      ('UNI-WHEEL-BEARING-INNER', 'Wheel Bearing Inner', 'driveline', 7600, 30, 10),
      ('UNI-WHEEL-BEARING-OUTER', 'Wheel Bearing Outer', 'driveline', 7600, 30, 10),
      ('UNI-WHEEL-SEAL', 'Wheel Bearing Seal', 'driveline', 3300, 48, 16),
      ('UNI-BRAKE-PAD-STEER', 'Brake Pad Set Steer Axle', 'brake_system', 17900, 40, 16),
      ('UNI-BRAKE-PAD-DRIVE', 'Brake Pad Set Drive Axle', 'brake_system', 20900, 60, 24),
      ('UNI-BRAKE-ROTOR-HD', 'Brake Rotor Heavy Duty', 'brake_system', 28600, 24, 10),
      ('UNI-BRAKE-DRUM-HD', 'Brake Drum Heavy Duty', 'brake_system', 26200, 24, 10),
      ('UNI-AIR-DRYER-CART', 'Air Dryer Cartridge', 'brake_air_system', 11200, 40, 16),
      ('UNI-SLACK-ADJ-AUTO', 'Automatic Slack Adjuster', 'brake_air_system', 8900, 40, 16),
      ('UNI-BRAKE-CHAMBER-T30', 'Brake Chamber Type 30', 'brake_air_system', 9300, 24, 10),
      ('UNI-TIRE-STEER-22_5', 'Steer Tire 22.5', 'tires_wheels', 49500, 30, 12),
      ('UNI-TIRE-DRIVE-22_5', 'Drive Tire 22.5', 'tires_wheels', 45500, 56, 24),
      ('UNI-TIRE-VALVE-STEM', 'Valve Stem Heavy Duty', 'tires_wheels', 850, 180, 90),
      ('UNI-BATT-GRP31-AGM', 'Battery Group 31 AGM', 'electrical', 21900, 48, 18),
      ('UNI-ALT-12V-HD', 'Alternator 12V Heavy Duty', 'electrical', 56500, 12, 5),
      ('UNI-STARTER-HD', 'Starter Motor Heavy Duty', 'electrical', 46900, 12, 5),
      ('UNI-HEADLAMP-LED', 'LED Headlamp Assembly', 'electrical', 6700, 40, 16),
      ('UNI-FUSE-KIT-ASSORT', 'Fuse Kit Assorted', 'electrical', 3500, 70, 24),
      ('UNI-WIPER-BLADE-28', 'Wiper Blade 28-inch', 'cab_hvac', 1400, 100, 40),
      ('UNI-AC-COMPRESSOR', 'A/C Compressor Kit', 'cab_hvac', 28900, 12, 5),
      ('UNI-AC-DRIER', 'A/C Receiver Drier', 'cab_hvac', 5400, 20, 8),
      ('UNI-DOT-TRIANGLES', 'DOT Warning Triangle Kit', 'dot_compliance', 4300, 20, 8),
      ('UNI-DOT-FIRE-EXT', 'Fire Extinguisher ABC', 'dot_compliance', 5900, 20, 8),
      ('UNI-DOT-FUSEE-KIT', 'Roadside Fusee Kit', 'dot_compliance', 2200, 16, 6)
  ) AS t(sku, name, category, unit_cost_cents, qty_on_hand, reorder_point)
),
make_service_kits AS (
  SELECT
    CONCAT('MK-', regexp_replace(fp.make, '[^A-Z0-9]+', '_', 'g'), '-', mk.base_code) AS sku,
    CONCAT(fp.make, ' ', mk.base_name) AS name,
    mk.category,
    mk.unit_cost_cents,
    mk.qty_on_hand,
    mk.reorder_point
  FROM (SELECT DISTINCT make FROM fleet_profiles) fp
  CROSS JOIN (
    VALUES
      ('OIL-SVC-KIT', 'Oil Service Kit', 'engine_lubrication', 13200, 32, 12),
      ('FUEL-SVC-KIT', 'Fuel Filter Service Kit', 'fuel_system', 15800, 28, 10),
      ('AIR-SVC-KIT', 'Air Intake Service Kit', 'air_intake', 14900, 24, 10),
      ('BRAKE-INSPECT-KIT', 'Brake Inspection Kit', 'brake_system', 18600, 20, 8),
      ('DOT-ANNUAL-KIT', 'DOT Annual Compliance Kit', 'dot_compliance', 9900, 12, 5),
      ('COOLANT-FLUSH-KIT', 'Coolant Flush Kit', 'cooling', 14500, 20, 8),
      ('TRANS-SVC-KIT', 'Transmission Service Kit', 'transmission', 17800, 18, 7),
      ('DIFF-SVC-KIT', 'Differential Service Kit', 'driveline', 13600, 16, 6),
      ('DEF-CHECK-KIT', 'DEF System Check Kit', 'emissions', 16800, 14, 6),
      ('BELT-HOSE-KIT', 'Belts and Hoses Inspection Kit', 'engine_accessories', 11200, 20, 8)
  ) AS mk(base_code, base_name, category, unit_cost_cents, qty_on_hand, reorder_point)
),
model_year_parts AS (
  SELECT
    CONCAT(
      'MMY-',
      fmy.make_slug,
      '-',
      fmy.model_slug,
      '-',
      COALESCE(fmy.year::TEXT, 'UNK'),
      '-',
      my.base_code
    ) AS sku,
    CONCAT(
      fmy.make,
      ' ',
      fmy.model,
      ' ',
      COALESCE(fmy.year::TEXT, 'Unknown Year'),
      ' ',
      my.base_name
    ) AS name,
    my.category,
    my.unit_cost_cents,
    my.qty_on_hand,
    my.reorder_point
  FROM fleet_make_model_years fmy
  CROSS JOIN (
    VALUES
      ('CABIN-FLTR-SVC', 'Cabin Air Filter Service Kit', 'cab_hvac', 7800, 16, 6),
      ('BATT-TEST-KIT', 'Battery and Charging Test Kit', 'electrical', 9200, 14, 6),
      ('WHEEL-BEARING-SVC', 'Wheel Bearing Service Kit', 'driveline', 14200, 14, 6)
  ) AS my(base_code, base_name, category, unit_cost_cents, qty_on_hand, reorder_point)
),
part_templates AS (
  SELECT * FROM common_parts
  UNION ALL
  SELECT * FROM make_service_kits
  UNION ALL
  SELECT * FROM model_year_parts
),
upsert_parts AS (
  INSERT INTO maint.part (
    tenant_id,
    sku,
    name,
    category,
    unit_cost_cents,
    qty_on_hand,
    reorder_point
  )
  SELECT
    ft.tenant_id,
    pt.sku,
    pt.name,
    pt.category,
    pt.unit_cost_cents,
    pt.qty_on_hand,
    pt.reorder_point
  FROM fleet_tenants ft
  CROSS JOIN part_templates pt
  ON CONFLICT (tenant_id, sku)
  DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit_cost_cents = EXCLUDED.unit_cost_cents,
    qty_on_hand = EXCLUDED.qty_on_hand,
    reorder_point = EXCLUDED.reorder_point,
    updated_at = NOW()
  RETURNING id
),
pm_templates AS (
  SELECT *
  FROM (
    VALUES
      ('oil change', 18000, 45),
      ('tire rotation', 12000, 30),
      ('brake inspection', 24000, 60),
      ('DOT annual', 144000, 365),
      ('air filter', 36000, 90),
      ('fuel filter', 24000, 60),
      ('coolant flush', 120000, 300),
      ('transmission service', 144000, 360),
      ('differential service', 96000, 240),
      ('A/C service', 48000, 120),
      ('cabin air filter', 24000, 60),
      ('DEF system check', 24000, 60),
      ('belts + hoses inspection', 36000, 90),
      ('battery test', 12000, 30),
      ('wheel bearing service', 72000, 180)
  ) AS t(pm_type, interval_miles, interval_days)
),
purge_pm_seed_rows AS (
  DELETE FROM maint.pm_schedule s
  USING fleet_assets fa
  WHERE s.tenant_id = fa.tenant_id
    AND s.asset_id = fa.asset_id
    AND s.pm_type = ANY (
      ARRAY[
        'oil',
        'tires',
        'dot_inspection',
        'brake',
        'transmission',
        'coolant',
        'oil change',
        'tire rotation',
        'brake inspection',
        'DOT annual',
        'air filter',
        'fuel filter',
        'coolant flush',
        'transmission service',
        'differential service',
        'A/C service',
        'cabin air filter',
        'DEF system check',
        'belts + hoses inspection',
        'battery test',
        'wheel bearing service'
      ]::TEXT[]
    )
  RETURNING s.id
),
pm_inserts AS (
  INSERT INTO maint.pm_schedule (
    tenant_id,
    asset_id,
    pm_type,
    interval_miles,
    interval_days
  )
  SELECT
    fa.tenant_id,
    fa.asset_id,
    pt.pm_type,
    pt.interval_miles,
    pt.interval_days
  FROM fleet_assets fa
  CROSS JOIN pm_templates pt
  ON CONFLICT (tenant_id, asset_id, pm_type)
  DO UPDATE SET
    interval_miles = EXCLUDED.interval_miles,
    interval_days = EXCLUDED.interval_days,
    updated_at = NOW()
  RETURNING id
),
required_pm_types AS (
  SELECT ARRAY[
    'oil change',
    'tire rotation',
    'brake inspection',
    'DOT annual',
    'air filter',
    'fuel filter',
    'coolant flush',
    'transmission service',
    'differential service',
    'A/C service',
    'cabin air filter',
    'DEF system check',
    'belts + hoses inspection',
    'battery test',
    'wheel bearing service'
  ]::TEXT[] AS pm_types
)
SELECT
  (SELECT COUNT(*) FROM fleet_profiles) AS fleet_units_seeded,
  (SELECT COUNT(DISTINCT make) FROM fleet_profiles) AS fleet_make_count,
  (SELECT COUNT(*) FROM fleet_make_model_years) AS fleet_make_model_year_count,
  (SELECT COUNT(*) FROM part_templates) AS part_template_count,
  (SELECT COUNT(DISTINCT category) FROM part_templates) AS part_category_count,
  (SELECT COUNT(*) FROM pm_templates) AS pm_template_count,
  (SELECT COUNT(*) FROM purge_seed_parts) AS legacy_part_rows_purged,
  (SELECT COUNT(*) FROM upsert_parts) AS parts_seeded_or_updated,
  (SELECT COUNT(*) FROM upsert_assets) AS assets_upserted,
  (SELECT COUNT(*) FROM purge_pm_seed_rows) AS legacy_pm_rows_purged,
  (SELECT COUNT(*) FROM pm_inserts) AS pm_rows_seeded,
  (SELECT bool_and(pt.pm_type = ANY(r.pm_types))
     FROM pm_templates pt
     CROSS JOIN required_pm_types r
  ) AS required_pm_type_list_satisfied;

COMMIT;
