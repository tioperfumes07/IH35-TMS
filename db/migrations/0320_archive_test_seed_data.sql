-- A16 / P8-AUDIT-TEST-DATA — archive TEST-* and seed-* rows (never delete).
-- Reversible via migration.test_seed_archive_ledger_0320 + DOWN section.

BEGIN;

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.test_seed_archive_ledger_0320 (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  archived_at timestamptz NOT NULL,
  migration_ts timestamptz NOT NULL,
  PRIMARY KEY (table_schema, table_name, row_id)
);

DO $$
DECLARE
  v_migration_ts timestamptz := clock_timestamp();
  v_driver_predicate text := 'FALSE';
  v_qbo_customer_predicate text := 'FALSE';
  v_user_predicate text := 'FALSE';
BEGIN
  -- mdata.drivers: add archived_at if missing
  IF to_regclass('mdata.drivers') IS NOT NULL THEN
    ALTER TABLE mdata.drivers ADD COLUMN IF NOT EXISTS archived_at timestamptz;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'drivers' AND column_name = 'display_name'
    ) THEN
      v_driver_predicate := v_driver_predicate || ' OR COALESCE(d.display_name, '''') ILIKE ''TEST-%'' OR COALESCE(d.display_name, '''') ILIKE ''seed-%''';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'drivers' AND column_name = 'display_id'
    ) THEN
      v_driver_predicate := v_driver_predicate || ' OR COALESCE(d.display_id, '''') ILIKE ''TEST-%'' OR COALESCE(d.display_id, '''') ILIKE ''seed-%''';
    END IF;

    v_driver_predicate := v_driver_predicate
      || ' OR COALESCE(d.first_name, '''') ILIKE ''TEST-%'''
      || ' OR COALESCE(d.last_name, '''') ILIKE ''TEST-%'''
      || ' OR COALESCE(d.first_name, '''') ILIKE ''seed-%'''
      || ' OR COALESCE(d.last_name, '''') ILIKE ''seed-%'''
      || ' OR COALESCE(d.email, '''') ILIKE ''%@seed.invalid'''
      || ' OR COALESCE(d.email, '''') ILIKE ''seed-test-%''';

    EXECUTE format(
      $sql$
        INSERT INTO migration.test_seed_archive_ledger_0320 (table_schema, table_name, row_id, archived_at, migration_ts)
        SELECT 'mdata', 'drivers', d.id, COALESCE(d.archived_at, $1), $1
        FROM mdata.drivers d
        WHERE (%s)
          AND d.archived_at IS NULL
      $sql$,
      v_driver_predicate
    ) USING v_migration_ts;

    EXECUTE format(
      $sql$
        UPDATE mdata.drivers d
        SET archived_at = COALESCE(d.archived_at, $1), updated_at = now()
        WHERE (%s)
          AND d.archived_at IS NULL
      $sql$,
      v_driver_predicate
    ) USING v_migration_ts;
  END IF;

  -- mdata.qbo_customers mirror
  IF to_regclass('mdata.qbo_customers') IS NOT NULL THEN
    ALTER TABLE mdata.qbo_customers ADD COLUMN IF NOT EXISTS archived_at timestamptz;

    v_qbo_customer_predicate := v_qbo_customer_predicate
      || ' OR COALESCE(q.display_name, '''') ILIKE ''TEST-%'''
      || ' OR COALESCE(q.display_name, '''') ILIKE ''seed-%''';

    EXECUTE format(
      $sql$
        INSERT INTO migration.test_seed_archive_ledger_0320 (table_schema, table_name, row_id, archived_at, migration_ts)
        SELECT 'mdata', 'qbo_customers', q.id, COALESCE(q.archived_at, $1), $1
        FROM mdata.qbo_customers q
        WHERE (%s)
          AND q.archived_at IS NULL
      $sql$,
      v_qbo_customer_predicate
    ) USING v_migration_ts;

    EXECUTE format(
      $sql$
        UPDATE mdata.qbo_customers q
        SET archived_at = COALESCE(q.archived_at, $1)
        WHERE (%s)
          AND q.archived_at IS NULL
      $sql$,
      v_qbo_customer_predicate
    ) USING v_migration_ts;
  END IF;

  -- accounting.qbo_customers (prod listing surface)
  IF to_regclass('accounting.qbo_customers') IS NOT NULL THEN
    ALTER TABLE accounting.qbo_customers ADD COLUMN IF NOT EXISTS archived_at timestamptz;

    EXECUTE format(
      $sql$
        INSERT INTO migration.test_seed_archive_ledger_0320 (table_schema, table_name, row_id, archived_at, migration_ts)
        SELECT 'accounting', 'qbo_customers', q.id, COALESCE(q.archived_at, $1), $1
        FROM accounting.qbo_customers q
        WHERE (%s)
          AND q.archived_at IS NULL
      $sql$,
      v_qbo_customer_predicate
    ) USING v_migration_ts;

    EXECUTE format(
      $sql$
        UPDATE accounting.qbo_customers q
        SET archived_at = COALESCE(q.archived_at, $1)
        WHERE (%s)
          AND q.archived_at IS NULL
      $sql$,
      v_qbo_customer_predicate
    ) USING v_migration_ts;
  END IF;

  -- identity.users (spec: auth.users)
  IF to_regclass('identity.users') IS NOT NULL THEN
    ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS archived_at timestamptz;

    v_user_predicate := v_user_predicate
      || ' OR COALESCE(u.email, '''') ILIKE ''%@seed.invalid'''
      || ' OR COALESCE(u.email, '''') ILIKE ''seed-test-%''';

    EXECUTE format(
      $sql$
        INSERT INTO migration.test_seed_archive_ledger_0320 (table_schema, table_name, row_id, archived_at, migration_ts)
        SELECT 'identity', 'users', u.id, COALESCE(u.archived_at, $1), $1
        FROM identity.users u
        WHERE (%s)
          AND u.archived_at IS NULL
      $sql$,
      v_user_predicate
    ) USING v_migration_ts;

    EXECUTE format(
      $sql$
        UPDATE identity.users u
        SET archived_at = COALESCE(u.archived_at, $1)
        WHERE (%s)
          AND u.archived_at IS NULL
      $sql$,
      v_user_predicate
    ) USING v_migration_ts;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_drivers_archived_at_null
  ON mdata.drivers (operating_company_id, created_at DESC)
  WHERE archived_at IS NULL;

DO $$
BEGIN
  IF to_regclass('mdata.qbo_customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_qbo_customers_archived_at_null
      ON mdata.qbo_customers (operating_company_id, mirrored_at DESC)
      WHERE archived_at IS NULL;
  END IF;
  IF to_regclass('accounting.qbo_customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_accounting_qbo_customers_archived_at_null
      ON accounting.qbo_customers (operating_company_id)
      WHERE archived_at IS NULL;
  END IF;
  IF to_regclass('identity.users') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_identity_users_archived_at_null
      ON identity.users (created_at DESC)
      WHERE archived_at IS NULL;
  END IF;
END
$$;

COMMIT;

-- DOWN
-- BEGIN;
-- UPDATE mdata.drivers d
-- SET archived_at = NULL
-- FROM migration.test_seed_archive_ledger_0320 l
-- WHERE l.table_schema = 'mdata' AND l.table_name = 'drivers' AND d.id = l.row_id AND d.archived_at = l.migration_ts;
-- UPDATE mdata.qbo_customers q
-- SET archived_at = NULL
-- FROM migration.test_seed_archive_ledger_0320 l
-- WHERE l.table_schema = 'mdata' AND l.table_name = 'qbo_customers' AND q.id = l.row_id AND q.archived_at = l.migration_ts;
-- UPDATE accounting.qbo_customers q
-- SET archived_at = NULL
-- FROM migration.test_seed_archive_ledger_0320 l
-- WHERE l.table_schema = 'accounting' AND l.table_name = 'qbo_customers' AND q.id = l.row_id AND q.archived_at = l.migration_ts;
-- UPDATE identity.users u
-- SET archived_at = NULL
-- FROM migration.test_seed_archive_ledger_0320 l
-- WHERE l.table_schema = 'identity' AND l.table_name = 'users' AND u.id = l.row_id AND u.archived_at = l.migration_ts;
-- DELETE FROM migration.test_seed_archive_ledger_0320;
-- DROP INDEX IF EXISTS idx_identity_users_archived_at_null;
-- DROP INDEX IF EXISTS idx_accounting_qbo_customers_archived_at_null;
-- DROP INDEX IF EXISTS idx_qbo_customers_archived_at_null;
-- DROP INDEX IF EXISTS idx_drivers_archived_at_null;
-- DROP TABLE IF EXISTS migration.test_seed_archive_ledger_0320;
-- COMMIT;
