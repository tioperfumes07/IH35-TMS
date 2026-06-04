-- P0-USERS-FIX — archive debug/probe identity.users from P0 verification (never delete).
-- Complements 0368 (last_login_at + claude-debug deactivated_at). Hides rows from operator listings.

BEGIN;

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.test_seed_archive_ledger_0369 (
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
  v_debug_emails text[] := ARRAY[
    'claude-debug-test@example.invalid',
    'claude-debug-test-2@example.invalid',
    'jorge-test-user@example.invalid',
    'pc4pzq7@example.invalid',
    'probe-correct-ujxpck@example.invalid',
    'smoke-office@example.invalid'
  ];
BEGIN
  IF to_regclass('identity.users') IS NOT NULL THEN
    ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS archived_at timestamptz;

    INSERT INTO migration.test_seed_archive_ledger_0369 (table_schema, table_name, row_id, archived_at, migration_ts)
    SELECT 'identity', 'users', u.id, COALESCE(u.archived_at, v_migration_ts), v_migration_ts
    FROM identity.users u
    WHERE lower(u.email) = ANY (SELECT lower(unnest(v_debug_emails)))
      AND u.archived_at IS NULL;

    UPDATE identity.users u
    SET
      archived_at = COALESCE(u.archived_at, v_migration_ts),
      deactivated_at = COALESCE(u.deactivated_at, v_migration_ts)
    WHERE lower(u.email) = ANY (SELECT lower(unnest(v_debug_emails)))
      AND (u.archived_at IS NULL OR u.deactivated_at IS NULL);
  END IF;
END
$$;

COMMIT;

-- DOWN
-- BEGIN;
-- UPDATE identity.users u
-- SET archived_at = NULL
-- FROM migration.test_seed_archive_ledger_0369 l
-- WHERE l.table_schema = 'identity' AND l.table_name = 'users' AND u.id = l.row_id
--   AND u.archived_at = l.migration_ts;
-- DELETE FROM migration.test_seed_archive_ledger_0369;
-- COMMIT;
