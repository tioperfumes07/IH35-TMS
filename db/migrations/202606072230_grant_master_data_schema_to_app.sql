-- Hotfix: grant schema-level USAGE on master_data to ih35_app.
--
-- 0407_permits_toll_tags.sql created the master_data schema and added
-- table-level GRANTs but omitted GRANT USAGE ON SCHEMA master_data. Without
-- schema-level USAGE, PostgreSQL denies the ih35_app role access to every
-- object in the schema at runtime, even though the table GRANTs are present.
-- This breaks the permit/toll-tag CRUD routes in production.
--
-- The original hotfix (#684) shipped as 20260607_183150_grant_master_data_
-- schema_to_app.sql, whose YYYYMMDD_HHMMSS filename matched neither migration
-- runner pattern (legacy ^\d{4}[a-z]?_ nor timestamp ^\d{12}_), so db:migrate
-- silently skipped it and it was never applied. This replacement uses the
-- runner-valid 12-digit YYYYMMDDHHMM timestamp format.
--
-- Idempotent: every statement is safe to re-run.

BEGIN;

GRANT USAGE ON SCHEMA master_data TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA master_data TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA master_data TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA master_data
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA master_data
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

COMMIT;
