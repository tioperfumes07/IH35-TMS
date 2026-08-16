-- ACCT-F5325 follow-up — migration 202612650000 revoked DELETE FROM PUBLIC on
-- driver_finance + banking, and revoked two direct ih35_app grants. Older migrations
-- (0123/0124/…) still left DIRECT `GRANT … DELETE … TO ih35_app` on ~40 tables.
-- CI `worm-public-grant-leak-closed.db.test` (and live has_table_privilege) still
-- saw DELETE via those direct grants — the PUBLIC-only revoke was incomplete.
--
-- Fix: revoke DELETE on ALL tables in both schemas FROM ih35_app (idempotent).
-- No app-code DELETE sites exist for these tables (same triage as 202612650000).
-- Triggers (trg_worm_refuse_delete) remain the runtime backstop.

BEGIN;

REVOKE DELETE ON ALL TABLES IN SCHEMA driver_finance FROM ih35_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA banking FROM ih35_app;

-- Re-assert PUBLIC revoke in case a later GRANT re-opened it on fresh CI DBs.
REVOKE DELETE ON ALL TABLES IN SCHEMA driver_finance FROM PUBLIC;
REVOKE DELETE ON ALL TABLES IN SCHEMA banking FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA driver_finance REVOKE DELETE ON TABLES FROM ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA banking REVOKE DELETE ON TABLES FROM ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA driver_finance REVOKE DELETE ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA banking REVOKE DELETE ON TABLES FROM PUBLIC;

COMMIT;
