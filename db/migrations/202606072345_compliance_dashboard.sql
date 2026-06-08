-- Block 16 closure: ensure compliance dashboard notification tables are reachable by ih35_app.
-- Core DDL lives in 0304_compliance_dashboard.sql; this idempotent grant repair uses the
-- runner-valid 12-digit YYYYMMDDHHMM filename format.

BEGIN;

GRANT USAGE ON SCHEMA compliance TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON compliance.notification_rules TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON compliance.notification_log TO ih35_app;

COMMIT;
