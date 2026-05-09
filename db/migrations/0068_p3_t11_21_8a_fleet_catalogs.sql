BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tractor_statuses',
    'trailer_statuses',
    'asset_condition_codes',
    'tire_positions',
    'unit_ownership_types'
  ]
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

CREATE OR REPLACE FUNCTION catalogs.__seed_fleet_catalog(p_table text, p_entries jsonb)
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

SELECT catalogs.__seed_fleet_catalog(
  'tractor_statuses',
  jsonb_build_array(
    jsonb_build_object('code', 'ACTIVE', 'name', 'Active', 'description', 'Available for dispatch operations', 'sort_order', 10),
    jsonb_build_object('code', 'IN-SHOP', 'name', 'In Shop', 'description', 'Currently in maintenance shop', 'sort_order', 20),
    jsonb_build_object('code', 'OUT-OF-SERVICE', 'name', 'Out of Service', 'description', 'Temporarily not dispatchable', 'sort_order', 30),
    jsonb_build_object('code', 'ROADSIDE', 'name', 'Roadside', 'description', 'Roadside event in progress', 'sort_order', 40),
    jsonb_build_object('code', 'AVAILABLE', 'name', 'Available', 'description', 'Ready for assignment', 'sort_order', 50),
    jsonb_build_object('code', 'ASSIGNED', 'name', 'Assigned', 'description', 'Assigned to a load/driver', 'sort_order', 60),
    jsonb_build_object('code', 'DEACTIVATED', 'name', 'Deactivated', 'description', 'Retired tractor unit', 'sort_order', 70)
  )
);

SELECT catalogs.__seed_fleet_catalog(
  'trailer_statuses',
  jsonb_build_array(
    jsonb_build_object('code', 'ACTIVE', 'name', 'Active', 'description', 'Available for trailer dispatch', 'sort_order', 10),
    jsonb_build_object('code', 'IN-SHOP', 'name', 'In Shop', 'description', 'Under maintenance service', 'sort_order', 20),
    jsonb_build_object('code', 'OUT-OF-SERVICE', 'name', 'Out of Service', 'description', 'Not safe for dispatch', 'sort_order', 30),
    jsonb_build_object('code', 'ROADSIDE', 'name', 'Roadside', 'description', 'Roadside issue in progress', 'sort_order', 40),
    jsonb_build_object('code', 'AVAILABLE', 'name', 'Available', 'description', 'Ready for assignment', 'sort_order', 50),
    jsonb_build_object('code', 'ASSIGNED', 'name', 'Assigned', 'description', 'Attached to active movement', 'sort_order', 60),
    jsonb_build_object('code', 'DEACTIVATED', 'name', 'Deactivated', 'description', 'Retired trailer', 'sort_order', 70)
  )
);

SELECT catalogs.__seed_fleet_catalog(
  'asset_condition_codes',
  jsonb_build_array(
    jsonb_build_object('code', 'A', 'name', 'A - Excellent', 'description', 'Excellent condition', 'sort_order', 10),
    jsonb_build_object('code', 'B', 'name', 'B - Good', 'description', 'Good condition', 'sort_order', 20),
    jsonb_build_object('code', 'C', 'name', 'C - Fair', 'description', 'Fair condition', 'sort_order', 30),
    jsonb_build_object('code', 'D', 'name', 'D - Poor', 'description', 'Poor condition', 'sort_order', 40),
    jsonb_build_object('code', 'E', 'name', 'E - Out of Service', 'description', 'Unsafe/out of service condition', 'sort_order', 50)
  )
);

SELECT catalogs.__seed_fleet_catalog(
  'tire_positions',
  jsonb_build_array(
    jsonb_build_object('code', 'STEER-LF', 'name', 'Steer Left Front', 'description', 'Steer axle left-front tire', 'sort_order', 10),
    jsonb_build_object('code', 'STEER-RF', 'name', 'Steer Right Front', 'description', 'Steer axle right-front tire', 'sort_order', 20),
    jsonb_build_object('code', 'DRIVE-LF1', 'name', 'Drive Left Front 1', 'description', 'First left tire on drive axle group', 'sort_order', 30),
    jsonb_build_object('code', 'DRIVE-LF2', 'name', 'Drive Left Front 2', 'description', 'Second left tire on drive axle group', 'sort_order', 40),
    jsonb_build_object('code', 'DRIVE-LR1', 'name', 'Drive Left Rear 1', 'description', 'First left-rear tire on drive axle group', 'sort_order', 50),
    jsonb_build_object('code', 'DRIVE-LR2', 'name', 'Drive Left Rear 2', 'description', 'Second left-rear tire on drive axle group', 'sort_order', 60),
    jsonb_build_object('code', 'DRIVE-RF1', 'name', 'Drive Right Front 1', 'description', 'First right tire on drive axle group', 'sort_order', 70),
    jsonb_build_object('code', 'DRIVE-RF2', 'name', 'Drive Right Front 2', 'description', 'Second right tire on drive axle group', 'sort_order', 80),
    jsonb_build_object('code', 'DRIVE-RR1', 'name', 'Drive Right Rear 1', 'description', 'First right-rear tire on drive axle group', 'sort_order', 90),
    jsonb_build_object('code', 'DRIVE-RR2', 'name', 'Drive Right Rear 2', 'description', 'Second right-rear tire on drive axle group', 'sort_order', 100)
  )
);

SELECT catalogs.__seed_fleet_catalog(
  'unit_ownership_types',
  jsonb_build_array(
    jsonb_build_object('code', 'OWNED', 'name', 'Owned', 'description', 'Company-owned asset', 'sort_order', 10),
    jsonb_build_object('code', 'LEASED-PURCHASE', 'name', 'Leased Purchase', 'description', 'Lease-to-own arrangement', 'sort_order', 20),
    jsonb_build_object('code', 'LEASED-OPERATING', 'name', 'Leased Operating', 'description', 'Operating lease asset', 'sort_order', 30),
    jsonb_build_object('code', 'RENTED', 'name', 'Rented', 'description', 'Short-term rental asset', 'sort_order', 40),
    jsonb_build_object('code', 'OWNER-OPERATOR', 'name', 'Owner Operator', 'description', 'Contracted owner-operator asset', 'sort_order', 50)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_fleet_catalog(text, jsonb);

COMMIT;
