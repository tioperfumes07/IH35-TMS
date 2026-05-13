BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

-- Global fleet catalogs (same shape as 0068 — T11.21.8A completion)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['trailer_types', 'lease_terms', 'asset_statuses', 'asset_locations']
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS catalogs.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text UNIQUE NOT NULL,
        name text NOT NULL,
        description text,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 100,
        deactivated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by_user_id uuid,
        updated_by_user_id uuid
      )',
      tbl
    );

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_code ON catalogs.%I (code)', tbl, tbl);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_active_sort ON catalogs.%I (is_active, sort_order) WHERE deactivated_at IS NULL',
      tbl,
      tbl
    );

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE catalogs.%I FORCE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_select_all ON catalogs.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_select_all ON catalogs.%I FOR SELECT TO ih35_app USING (true)', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert_admin ON catalogs.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_insert_admin ON catalogs.%I FOR INSERT TO ih35_app WITH CHECK (identity.current_user_role() IN (''Owner'', ''Administrator''))',
      tbl,
      tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_update_admin ON catalogs.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_update_admin ON catalogs.%I FOR UPDATE TO ih35_app USING (identity.current_user_role() IN (''Owner'', ''Administrator'')) WITH CHECK (identity.current_user_role() IN (''Owner'', ''Administrator''))',
      tbl,
      tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_lucia_bypass ON catalogs.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_lucia_bypass ON catalogs.%I FOR ALL TO ih35_app USING (identity.is_lucia_bypass()) WITH CHECK (identity.is_lucia_bypass())',
      tbl,
      tbl
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION catalogs.__seed_fleet_catalog_completion(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql text;
BEGIN
  sql := format(
    $SQL$
      INSERT INTO catalogs.%I (code, name, description, is_active, sort_order)
      SELECT x.code, x.name, x.description, true, x.sort_order
      FROM jsonb_to_recordset($1) AS x(
        code text,
        name text,
        description text,
        sort_order int
      )
      ON CONFLICT (code) DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
END
$$;

SELECT catalogs.__seed_fleet_catalog_completion(
  'trailer_types',
  jsonb_build_array(
    jsonb_build_object('code', 'DRY-VAN-53', 'name', '53'' dry van', 'description', 'Standard dry van trailer', 'sort_order', 10),
    jsonb_build_object('code', 'REEFER-53', 'name', '53'' reefer', 'description', 'Refrigerated van trailer', 'sort_order', 20),
    jsonb_build_object('code', 'FLATBED-48', 'name', '48'' flatbed', 'description', 'Open deck flatbed', 'sort_order', 30),
    jsonb_build_object('code', 'STEP-DECK', 'name', 'Step deck', 'description', 'Step / drop deck trailer', 'sort_order', 40)
  )
);

SELECT catalogs.__seed_fleet_catalog_completion(
  'lease_terms',
  jsonb_build_array(
    jsonb_build_object('code', '36-MO', 'name', '36 month', 'description', '36-month finance / lease term', 'sort_order', 10),
    jsonb_build_object('code', '48-MO', 'name', '48 month', 'description', '48-month finance / lease term', 'sort_order', 20),
    jsonb_build_object('code', '60-MO', 'name', '60 month', 'description', '60-month finance / lease term', 'sort_order', 30),
    jsonb_build_object('code', 'MONTH-MONTH', 'name', 'Month-to-month', 'description', 'Short-term rental / monthly', 'sort_order', 40)
  )
);

SELECT catalogs.__seed_fleet_catalog_completion(
  'asset_statuses',
  jsonb_build_array(
    jsonb_build_object('code', 'ACTIVE', 'name', 'Active', 'description', 'In revenue service', 'sort_order', 10),
    jsonb_build_object('code', 'STORED', 'name', 'Stored', 'description', 'Idle / stored status', 'sort_order', 20),
    jsonb_build_object('code', 'FOR-SALE', 'name', 'For sale', 'description', 'Listed for disposition', 'sort_order', 30),
    jsonb_build_object('code', 'SALVAGE', 'name', 'Salvage', 'description', 'Awaiting salvage / total loss', 'sort_order', 40)
  )
);

SELECT catalogs.__seed_fleet_catalog_completion(
  'asset_locations',
  jsonb_build_array(
    jsonb_build_object('code', 'YARD-MAIN', 'name', 'Main yard', 'description', 'Primary terminal yard', 'sort_order', 10),
    jsonb_build_object('code', 'SHOP-A', 'name', 'Shop bay A', 'description', 'Internal shop staging', 'sort_order', 20),
    jsonb_build_object('code', 'THIRD-PARTY', 'name', 'Third-party shop', 'description', 'External vendor location', 'sort_order', 30)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_fleet_catalog_completion(text, jsonb);

COMMIT;
