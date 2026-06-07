-- HOTFIX-GAP-81 companion: pre-seed tenant policies on carrier-scoped tables
-- so 0385's dynamic RLS sweep does not attempt uuid-only comparisons on text ids.
BEGIN;

DO $$
DECLARE
  rec RECORD;
  pol_name text;
  policy_count int;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'operating_company_id' AND NOT a.attisdropped
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    SELECT count(*)::int INTO policy_count
    FROM pg_policy p
    WHERE p.polrelid = rec.oid;

    IF policy_count = 0 THEN
      IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rec.oid) THEN
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
      END IF;

      pol_name := left(rec.table_name || '_tenant_scope_pre0385', 63);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol_name, rec.schema_name, rec.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO ih35_app
         USING (identity.is_lucia_bypass() OR operating_company_id::text = NULLIF(current_setting(''app.operating_company_id'', true), ''''))
         WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = NULLIF(current_setting(''app.operating_company_id'', true), ''''))',
        pol_name, rec.schema_name, rec.table_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
-- HOTFIX-GAP-81 companion: pre-seed tenant policies on carrier-scoped tables
-- so 0385's dynamic RLS sweep does not attempt uuid-only comparisons on text ids.
BEGIN;

DO $$
DECLARE
  rec RECORD;
  pol_name text;
  policy_count int;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'operating_company_id' AND NOT a.attisdropped
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    SELECT count(*)::int INTO policy_count
    FROM pg_policy p
    WHERE p.polrelid = rec.oid;

    IF policy_count = 0 THEN
      IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rec.oid) THEN
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
      END IF;

      pol_name := left(rec.table_name || '_tenant_scope_pre0385', 63);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol_name, rec.schema_name, rec.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO ih35_app
         USING (identity.is_lucia_bypass() OR operating_company_id::text = NULLIF(current_setting(''app.operating_company_id'', true), ''''))
         WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = NULLIF(current_setting(''app.operating_company_id'', true), ''''))',
        pol_name, rec.schema_name, rec.table_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
