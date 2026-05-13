BEGIN;

-- P6-T11187 Block K — additive driver catalog seeds (T11.21.4A)
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

COMMIT;
