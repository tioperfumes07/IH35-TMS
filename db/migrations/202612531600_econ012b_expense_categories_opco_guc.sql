-- ECON-012b — catalogs.expense_categories INSERT requires app.operating_company_id GUC
-- (lucia bypass policy on this table is SELECT-only). Re-runs the ECON-012 seed with
-- set_config per opco. Idempotent upsert — safe on prod where seed already landed.
-- REHEARSED: apply-twice; no hardcoded company UUID.

BEGIN;

DO $$
DECLARE
  r RECORD;
  catalog_code text;
  display_name text;
  meta jsonb;
BEGIN
  FOR r IN
    SELECT DISTINCT
      m.operating_company_id,
      m.category_kind,
      m.category_code
    FROM accounting.expense_category_account_map m
    JOIN org.companies c ON c.id = m.operating_company_id
    WHERE COALESCE(m.is_active, true) = true
      AND lower(m.category_kind) IS DISTINCT FROM 'revenue'
      AND nullif(trim(m.category_code), '') IS NOT NULL
  LOOP
    PERFORM set_config('app.operating_company_id', r.operating_company_id::text, true);

    IF lower(r.category_kind) = 'fuel' AND lower(r.category_code) = 'fuel' THEN
      catalog_code := 'FUEL';
    ELSIF lower(r.category_kind) = 'maintenance' AND lower(r.category_code) = 'maintenance' THEN
      catalog_code := 'REPAIR';
    ELSIF lower(r.category_kind) = 'permit' AND lower(r.category_code) = 'permit' THEN
      catalog_code := 'PERMIT';
    ELSE
      catalog_code := upper(r.category_code);
    END IF;

    display_name := initcap(replace(lower(r.category_code), '_', ' '));
    meta := jsonb_build_object(
      'category_kind', lower(r.category_kind),
      'category_code', lower(r.category_code),
      'econ012', true
    );

    INSERT INTO catalogs.expense_categories (
      id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), r.operating_company_id, catalog_code, display_name,
      'ECON-012 seed from expense_category_account_map', meta, true, 100, now(), now()
    )
    ON CONFLICT (operating_company_id, code) DO UPDATE
      SET
        metadata = COALESCE(catalogs.expense_categories.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        is_active = true,
        updated_at = now();
  END LOOP;
END $$;

COMMIT;
