-- WAVE-H1 (CLS-ECON-EMPTY): seed catalogs.cash_advance_types only.
-- Owner lock 2026-07-31: expense_categories / escrow_types / driver_deduction_types /
-- chart_of_accounts_seeds are already populated per-opco — do NOT re-seed them.
-- Parts catalog is OUT of H1. CoA roles bind on accounting.chart_of_accounts_roles (no seed here).
-- Idempotent via catalogs.__seed_company_catalog ON CONFLICT.

SELECT catalogs.__seed_company_catalog(
  'cash_advance_types',
  jsonb_build_array(
    jsonb_build_object('code', 'ROUTE', 'display_name', 'Route advance', 'description', 'Route-related advance', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'FUEL', 'display_name', 'Fuel advance', 'description', 'Fuel cash advance', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'EMERGENCY', 'display_name', 'Emergency advance', 'description', 'Emergency / family advance', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'EQUIPMENT', 'display_name', 'Equipment advance', 'description', 'Equipment-related advance', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'MEDICAL', 'display_name', 'Medical advance', 'description', 'Medical emergency advance', 'metadata', '{}'::jsonb, 'sort_order', 50),
    jsonb_build_object('code', 'OTHER', 'display_name', 'Other advance', 'description', 'Other cash advance', 'metadata', '{}'::jsonb, 'sort_order', 60)
  )
);
