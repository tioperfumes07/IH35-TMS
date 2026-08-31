-- 202613311300_insurance_driver_schedule_revoke_delete_grants.sql
-- FIX: migration 202613311200 created insurance.driver_schedule and insurance.schedule_confirmations
-- with narrow GRANT statements, but the insurance schema has ALTER DEFAULT PRIVILEGES that grant
-- arwd (SELECT, INSERT, UPDATE, DELETE) to ih35_app on all new tables. The narrow GRANT was not
-- enough — ih35_app received DELETE on both tables from the default privileges.
--
-- This migration REVOKEs the excess grants:
--   insurance.driver_schedule: REVOKE DELETE (soft-delete via is_active/voided_at, never hard DELETE)
--   insurance.schedule_confirmations: REVOKE UPDATE, DELETE (APPEND-ONLY WORM — corrections are new linked records)
--
-- Also fixes the ALTER DEFAULT PRIVILEGES for the insurance schema so future tables get the correct
-- default grant (SELECT, INSERT, UPDATE — no DELETE).
--
-- Idempotent — REVOKE is a no-op if the privilege doesn't exist.

-- ── Fix ALTER DEFAULT PRIVILEGES for the insurance schema ───────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA insurance REVOKE DELETE ON TABLES FROM ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA insurance GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

-- ── REVOKE excess grants on driver_schedule (soft-delete only, no hard DELETE) ──────────────────────
REVOKE DELETE ON insurance.driver_schedule FROM ih35_app;

-- ── REVOKE excess grants on schedule_confirmations (APPEND-ONLY WORM) ──────────────────────────────
REVOKE UPDATE ON insurance.schedule_confirmations FROM ih35_app;
REVOKE DELETE ON insurance.schedule_confirmations FROM ih35_app;
