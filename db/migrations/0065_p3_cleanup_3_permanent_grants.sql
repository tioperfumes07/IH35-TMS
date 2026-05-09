-- Permanent grants for ih35_app on all project schemas + tables.
-- Idempotent: GRANT statements are safe to re-run.

BEGIN;

-- ============================================================
-- SCHEMA USAGE + TABLE/SEQUENCE PRIVILEGES + DEFAULT PRIVILEGES
-- ============================================================
DO $$
DECLARE
  s text;
  schemas text[] := ARRAY[
    -- Schemas discovered from inspection + known project schemas.
    'accounting',
    'audit',
    'banking',
    'catalogs',
    'compliance',
    'dispatch',
    'docs',
    'driver_finance',
    'factoring',
    'fuel',
    'identity',
    'maintenance',
    'master_data',
    'mdata',
    'neon_auth',
    'org',
    'outbox',
    'reports',
    'safety',
    'views'
  ];
BEGIN
  FOREACH s IN ARRAY schemas
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = s
    ) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO ih35_app', s);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ih35_app', s);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO ih35_app', s);

      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app',
        s
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO ih35_app',
        s
      );

      RAISE NOTICE 'Grants applied to schema: %', s;
    ELSE
      RAISE NOTICE 'Schema does not exist, skipping: %', s;
    END IF;
  END LOOP;
END $$;

COMMIT;
