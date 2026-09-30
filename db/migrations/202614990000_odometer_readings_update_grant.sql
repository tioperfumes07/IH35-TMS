-- ACCT-F180 (same failure class as 202612360000_idempotency_keys_update_grant.sql) -- found while
-- shipping ROUND 300 A-31: verify-schema-usage-grants.mjs (required CI, blocking every PR company-
-- wide) flags apps/backend/src/telematics/odometer-manual.routes.ts's
-- INSERT ... ON CONFLICT (operating_company_id, unit_id, telematics.odometer_reading_day(read_at),
-- source) DO UPDATE against telematics.odometer_readings -- PostgreSQL requires BOTH INSERT and
-- UPDATE privileges for ON CONFLICT DO UPDATE, checked at plan time, and no migration anywhere
-- grants UPDATE on this table to ih35_app.
--
-- LIVE-VERIFIED this is a REBUILD-PATH gap, not a live-500: `information_schema.role_table_grants`
-- on br-fancy-credit-akjnd07a shows ih35_app already holds INSERT/SELECT/UPDATE/DELETE on
-- telematics.odometer_readings today (granted by some path this guard's static scan cannot see --
-- most likely a broad/manual grant, not a migration-expressed one). Production is not currently
-- broken; a fresh database or a DR restore would come back without this grant and break on the
-- first manual odometer entry. Correcting the record explicitly so this reads as what it is (same
-- distinction the Lead drew on PR #23441's downtime-schema correction, 2026-09-30).
--
-- ADDITIVE + IDEMPOTENT. A GRANT is not a schema change; re-running is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    RETURN;
  END IF;

  IF to_regclass('telematics.odometer_readings') IS NOT NULL THEN
    EXECUTE 'GRANT UPDATE ON telematics.odometer_readings TO ih35_app';
  END IF;
END
$$;
