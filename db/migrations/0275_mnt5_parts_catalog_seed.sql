BEGIN;

WITH fleet_tenants AS (
  SELECT DISTINCT COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS tenant_id
  FROM mdata.units u
  WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) IS NOT NULL
  UNION
  SELECT DISTINCT a.tenant_id
  FROM mdata.assets a
  WHERE a.tenant_id IS NOT NULL
),
part_templates AS (
  SELECT *
  FROM (
    VALUES
      ('CAT-OIL-15W40', 'Engine Oil 15W-40 (1 gal)', 'engine_lubrication', 4200, 12, 8),
      ('CAT-OIL-FLTR', 'Engine Oil Filter', 'engine_lubrication', 2500, 8, 6),
      ('CAT-FUEL-FLTR', 'Primary Fuel Filter', 'fuel_system', 3200, 8, 6),
      ('CAT-FUEL-WTR', 'Fuel/Water Separator', 'fuel_system', 2900, 6, 4),
      ('CAT-AIR-FLTR', 'Engine Air Filter', 'air_intake', 7900, 4, 3),
      ('CAT-COOL-OAT', 'OAT Coolant Concentrate (1 gal)', 'cooling', 2700, 10, 6),
      ('CAT-COOL-FLTR', 'Coolant Filter', 'cooling', 3100, 4, 2),
      ('CAT-TRANS-PS386', 'Transmission Fluid PS-386 (1 gal)', 'transmission', 5900, 8, 4),
      ('CAT-GEAR-75W90', 'Synthetic Gear Lube 75W-90 (1 gal)', 'driveline', 4900, 8, 4),
      ('CAT-BRAKE-PAD-S', 'Brake Pad Set - Steer Axle', 'brake', 18900, 2, 1),
      ('CAT-BRAKE-PAD-D', 'Brake Pad Set - Drive Axle', 'brake', 21200, 2, 1),
      ('CAT-AIR-DRYER', 'Air Dryer Cartridge Kit', 'brake_air_system', 13200, 2, 1),
      ('CAT-TIRE-STEER', 'Steer Tire 22.5"', 'tires', 52500, 2, 2),
      ('CAT-TIRE-DRIVE', 'Drive Tire 22.5"', 'tires', 47000, 4, 4),
      ('CAT-BELT-SERP', 'Heavy-Duty Serpentine Belt', 'engine_accessories', 14500, 2, 1),
      ('CAT-DEF-FLTR', 'DEF Filter Service Kit', 'emissions', 9800, 2, 1),
      ('CAT-WIPER-28', 'Wiper Blade 28 inch', 'cab_safety', 1700, 6, 4),
      ('CAT-HEADLAMP-H11', 'LED Headlamp H11', 'electrical', 6200, 2, 1)
  ) AS t(sku, name, category, unit_cost_cents, qty_on_hand, reorder_point)
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
    reorder_point = EXCLUDED.reorder_point,
    updated_at = NOW()
  RETURNING id
),
asset_pm_templates AS (
  SELECT *
  FROM (
    VALUES
      ('oil', 25000, 180),
      ('tires', 6000, 120),
      ('dot_inspection', NULL::int, 365),
      ('brake', 20000, 120),
      ('transmission', 180000, 1095),
      ('coolant', 150000, 730)
  ) AS t(pm_type, interval_miles, interval_days)
),
target_assets AS (
  SELECT
    a.id AS asset_id,
    a.tenant_id
  FROM mdata.assets a
  WHERE a.tenant_id IS NOT NULL
    AND a.status <> 'retired'
),
insert_pm_templates AS (
  INSERT INTO maint.pm_schedule (
    tenant_id,
    asset_id,
    pm_type,
    interval_miles,
    interval_days
  )
  SELECT
    ta.tenant_id,
    ta.asset_id,
    apt.pm_type,
    apt.interval_miles,
    apt.interval_days
  FROM target_assets ta
  CROSS JOIN asset_pm_templates apt
  WHERE NOT EXISTS (
    SELECT 1
    FROM maint.pm_schedule s
    WHERE s.tenant_id = ta.tenant_id
      AND s.asset_id = ta.asset_id
      AND s.pm_type = apt.pm_type
  )
  RETURNING id
)
SELECT
  (SELECT count(*) FROM upsert_parts) AS parts_seeded_or_updated,
  (SELECT count(*) FROM insert_pm_templates) AS pm_templates_inserted;

COMMIT;
