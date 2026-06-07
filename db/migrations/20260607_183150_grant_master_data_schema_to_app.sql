-- Hotfix: grant schema-level USAGE on master_data to ih35_app.
--
-- 0407_permits_toll_tags.sql created the master_data schema and added
-- table-level GRANTs (SELECT, INSERT, UPDATE) but omitted the required
-- GRANT USAGE ON SCHEMA master_data TO ih35_app.
--
-- Without schema-level USAGE, PostgreSQL denies access to all objects within
-- master_data for the ih35_app role at runtime, even though the table GRANTs
-- are present.  This is the same failure class as 0309_notification_center.
--
-- This migration is required by the schema-grant-check CI gate (PREREQ-A).

BEGIN;

GRANT USAGE ON SCHEMA master_data TO ih35_app;

-- Ensure future tables in this schema are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA master_data
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA master_data
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

COMMIT;
