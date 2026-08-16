-- LV-NO-TARP-ACCESSORIAL-PAY-TYPE
-- Seed flatbed / accessorial driver pay types per active operating company.
-- Owner Scenario B: Enlonada + Desenlonada tarp pay must be typed catalog codes,
-- not free-text extra_pay. ADDITIVE ONLY — does not repurpose EXTRA-STOP / TONU.
-- Pattern: 0150_p6_t11187_lists_hub_driver_catalog_seeds.sql via __seed_company_catalog.

SELECT catalogs.__seed_company_catalog(
  'driver_pay_types',
  jsonb_build_array(
    jsonb_build_object(
      'code', 'ENLONADA',
      'display_name', 'Tarp / Enlonada',
      'description', 'Flatbed tarp cover (enlonada) accessorial pay',
      'metadata', '{}'::jsonb,
      'sort_order', 80
    ),
    jsonb_build_object(
      'code', 'DESENLONADA',
      'display_name', 'Untarp / Desenlonada',
      'description', 'Flatbed tarp remove (desenlonada) accessorial pay',
      'metadata', '{}'::jsonb,
      'sort_order', 90
    ),
    jsonb_build_object(
      'code', 'DETENTION',
      'display_name', 'Detention',
      'description', 'Driver detention / wait-time accessorial pay',
      'metadata', '{}'::jsonb,
      'sort_order', 100
    ),
    jsonb_build_object(
      'code', 'LAYOVER',
      'display_name', 'Layover',
      'description', 'Driver layover accessorial pay',
      'metadata', '{}'::jsonb,
      'sort_order', 110
    ),
    jsonb_build_object(
      'code', 'LUMPER',
      'display_name', 'Lumper',
      'description', 'Lumper / lumping accessorial pay',
      'metadata', '{}'::jsonb,
      'sort_order', 120
    )
  )
);
