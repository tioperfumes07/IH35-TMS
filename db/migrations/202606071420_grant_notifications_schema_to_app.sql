-- Grant notifications schema access to ih35_app role.
-- Fixes: "permission denied for schema notifications" and
--        "permission denied for sequence audit.row_changes_id_seq"
-- These errors were blocking login and every page load in production.

GRANT USAGE ON SCHEMA notifications TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notifications TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA notifications TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;
GRANT USAGE ON SEQUENCE audit.row_changes_id_seq TO ih35_app;
