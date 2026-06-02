-- 0299_grant_aggregate_schemas.sql
-- Grants USAGE + SELECT on schemas ih35_app queries (0043 missed USAGE on fuel).
-- Idempotent: safe to re-run.
BEGIN;

DO $$
DECLARE
  schemas text[] := ARRAY[
    'fuel',
    'driver_pwa',
    'driver_pay',
    'expense_attribution',
    'factor',
    'factoring',
    'payroll',
    'reports',
    'audit',
    'catalogs',
    'docs',
    'driver_finance',
    'integrations',
    'maintenance',
    'mdata',
    'telematics',
    'integrity',
    'inventory',
    'notifications'
  ];
  s text;
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO ih35_app', s);
      EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO ih35_app', s);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA %I GRANT SELECT ON TABLES TO ih35_app',
        s
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;
