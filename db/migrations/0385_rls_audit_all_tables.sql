-- USMCA-1: enforce FORCE ROW LEVEL SECURITY on carrier-scoped tables that only had ENABLE.
-- Idempotent — skips tables already forced or without operating_company_id.
BEGIN;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'operating_company_id'
          AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      rec.schema_name,
      rec.table_name
    );
  END LOOP;
END $$;

COMMIT;
