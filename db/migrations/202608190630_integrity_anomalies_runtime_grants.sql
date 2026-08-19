BEGIN;

-- The anomaly detector and status routes execute as ih35_app. Migration 0280
-- only granted the table to neondb_owner, leaving production able to read the
-- table through inherited privileges but unable to create or lifecycle rows.
GRANT USAGE ON SCHEMA integrity TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrity.anomalies TO ih35_app;

COMMIT;
