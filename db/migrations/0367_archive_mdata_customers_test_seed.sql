-- P8-AUDIT-TEST-DATA — archive TEST-/seed-* mdata.customers (never delete).

BEGIN;

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.test_seed_archive_ledger_0367 (
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
  v_customer_predicate text := 'FALSE';
BEGIN
  IF to_regclass('mdata.customers') IS NOT NULL THEN
    ALTER TABLE mdata.customers ADD COLUMN IF NOT EXISTS archived_at timestamptz;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'customers' AND column_name = 'customer_name'
    ) THEN
      v_customer_predicate := v_customer_predicate
        || ' OR COALESCE(c.customer_name, '''') ILIKE ''TEST-%'''
        || ' OR COALESCE(c.customer_name, '''') ILIKE ''seed-%''';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'customers' AND column_name = 'customer_code'
    ) THEN
      v_customer_predicate := v_customer_predicate
        || ' OR COALESCE(c.customer_code, '''') ILIKE ''TEST-%'''
        || ' OR COALESCE(c.customer_code, '''') ILIKE ''seed-%''';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'mdata' AND table_name = 'customers' AND column_name = 'display_id'
    ) THEN
      v_customer_predicate := v_customer_predicate
        || ' OR COALESCE(c.display_id, '''') ILIKE ''TEST-%'''
        || ' OR COALESCE(c.display_id, '''') ILIKE ''seed-%''';
    END IF;

    EXECUTE format(
      $sql$
        INSERT INTO migration.test_seed_archive_ledger_0367 (table_schema, table_name, row_id, archived_at, migration_ts)
        SELECT 'mdata', 'customers', c.id, COALESCE(c.archived_at, $1), $1
        FROM mdata.customers c
        WHERE (%s)
          AND c.archived_at IS NULL
      $sql$,
      v_customer_predicate
    ) USING v_migration_ts;

    EXECUTE format(
      $sql$
        UPDATE mdata.customers c
        SET archived_at = COALESCE(c.archived_at, $1), updated_at = now()
        WHERE (%s)
          AND c.archived_at IS NULL
      $sql$,
      v_customer_predicate
    ) USING v_migration_ts;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_mdata_customers_archived_at_null
  ON mdata.customers (operating_company_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMIT;

-- DOWN
-- BEGIN;
-- UPDATE mdata.customers c
-- SET archived_at = NULL
-- FROM migration.test_seed_archive_ledger_0367 l
-- WHERE l.table_schema = 'mdata' AND l.table_name = 'customers' AND c.id = l.row_id AND c.archived_at = l.migration_ts;
-- DELETE FROM migration.test_seed_archive_ledger_0367;
-- DROP INDEX IF EXISTS idx_mdata_customers_archived_at_null;
-- DROP TABLE IF EXISTS migration.test_seed_archive_ledger_0367;
-- COMMIT;
