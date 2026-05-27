BEGIN;

DO $$
DECLARE
  legacy_0237 CONSTANT text := '0237_accounting_ar_collection_tasks.sql';
  legacy_0238 CONSTANT text := '0238_accounting_ar_collection_tasks.sql';
  has_checksum_column boolean := false;
BEGIN
  IF to_regclass('_system._schema_migrations') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = '_system'
        AND table_name = '_schema_migrations'
        AND column_name = 'checksum'
    )
    INTO has_checksum_column;

    IF has_checksum_column THEN
      INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
      SELECT legacy_0237, checksum, applied_at, applied_by, duration_ms
      FROM _system._schema_migrations
      WHERE filename = legacy_0238
      ON CONFLICT (filename) DO NOTHING;

      INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
      SELECT legacy_0238, checksum, applied_at, applied_by, duration_ms
      FROM _system._schema_migrations
      WHERE filename = legacy_0237
      ON CONFLICT (filename) DO NOTHING;
    ELSE
      INSERT INTO _system._schema_migrations (filename, applied_at)
      SELECT legacy_0237, applied_at
      FROM _system._schema_migrations
      WHERE filename = legacy_0238
      ON CONFLICT (filename) DO NOTHING;

      INSERT INTO _system._schema_migrations (filename, applied_at)
      SELECT legacy_0238, applied_at
      FROM _system._schema_migrations
      WHERE filename = legacy_0237
      ON CONFLICT (filename) DO NOTHING;
    END IF;
  END IF;

  IF to_regclass('ih35_migrations.applied_migrations') IS NOT NULL THEN
    INSERT INTO ih35_migrations.applied_migrations (name, applied_at)
    SELECT legacy_0237, applied_at
    FROM ih35_migrations.applied_migrations
    WHERE name = legacy_0238
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO ih35_migrations.applied_migrations (name, applied_at)
    SELECT legacy_0238, applied_at
    FROM ih35_migrations.applied_migrations
    WHERE name = legacy_0237
    ON CONFLICT (name) DO NOTHING;
  END IF;
END
$$;

COMMIT;
