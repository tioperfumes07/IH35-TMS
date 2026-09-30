-- verify:aggregate-schema-grants FAIL — production already has USAGE ON SCHEMA downtime plus
-- SELECT/INSERT/UPDATE/DELETE on every downtime.* table granted to ih35_app (applied directly,
-- 2026-09-30), but no migration ever created it, so a fresh database (CI, DR restore, new
-- branch) would not. Idempotent record of what prod already carries -- matches the pattern
-- CLAUDE.md's "Database Grants" section documents for every other schema.
BEGIN;

GRANT USAGE ON SCHEMA downtime TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA downtime TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA downtime
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;

COMMIT;
