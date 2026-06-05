-- CLOSURE-8 — soft-archive identity seed/test users (never delete).
BEGIN;

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.test_seed_archive_ledger_0396 (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  archived_at timestamptz NOT NULL,
  archived_reason text NOT NULL,
  migration_ts timestamptz NOT NULL,
  PRIMARY KEY (table_schema, table_name, row_id)
);

DO $$
DECLARE
  v_migration_ts timestamptz := clock_timestamp();
  v_reason text := 'seed_data_cleanup_p8_audit';
BEGIN
  IF to_regclass('identity.users') IS NOT NULL THEN
    ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS archived_reason text;

    INSERT INTO migration.test_seed_archive_ledger_0396 (table_schema, table_name, row_id, archived_at, archived_reason, migration_ts)
    SELECT 'identity', 'users', u.id, COALESCE(u.archived_at, v_migration_ts), v_reason, v_migration_ts
    FROM identity.users u
    WHERE u.archived_at IS NULL
      AND (
        lower(u.email) LIKE '%@test.invalid'
        OR lower(u.email) LIKE '%@example.com'
        OR lower(u.email) LIKE 'integration.%'
      );

    UPDATE identity.users u
    SET
      archived_at = COALESCE(u.archived_at, v_migration_ts),
      archived_reason = COALESCE(u.archived_reason, v_reason),
      deactivated_at = COALESCE(u.deactivated_at, v_migration_ts)
    WHERE u.archived_at IS NULL
      AND (
        lower(u.email) LIKE '%@test.invalid'
        OR lower(u.email) LIKE '%@example.com'
        OR lower(u.email) LIKE 'integration.%'
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_identity_users_archived_at_null
  ON identity.users (archived_at)
  WHERE archived_at IS NULL;

COMMIT;
