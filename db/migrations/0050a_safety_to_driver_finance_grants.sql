BEGIN;

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
    IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_liabilities TO ih35_app;
    END IF;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA driver_finance TO ih35_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA driver_finance
      GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA driver_finance
      GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regnamespace('docs') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA docs TO ih35_app;
    IF to_regclass('docs.files') IS NOT NULL THEN
      GRANT SELECT ON docs.files TO ih35_app;
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regnamespace('mdata') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA mdata TO ih35_app;
  END IF;
  IF to_regclass('mdata.drivers') IS NOT NULL THEN
    GRANT SELECT ON mdata.drivers TO ih35_app;
  END IF;
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    GRANT SELECT ON mdata.loads TO ih35_app;
  END IF;
  IF to_regclass('mdata.units') IS NOT NULL THEN
    GRANT SELECT ON mdata.units TO ih35_app;
  END IF;
END
$$;

COMMIT;
