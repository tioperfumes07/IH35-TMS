-- P7 — Self-heal schema USAGE for app role on banking / email / qbo.
-- Deployed databases may have applied older revisions of 0072 / 0144 / 0154 before those files gained GRANT USAGE.
-- Matches pattern: GRANT USAGE ON SCHEMA sms TO ih35_app (0166_block_h_notification_queues.sql).

BEGIN;

GRANT USAGE ON SCHEMA banking TO ih35_app;
GRANT USAGE ON SCHEMA email TO ih35_app;
GRANT USAGE ON SCHEMA qbo TO ih35_app;

COMMIT;
