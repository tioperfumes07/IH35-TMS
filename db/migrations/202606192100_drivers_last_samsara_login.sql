-- Driver last-Samsara-login, for the inactivity-by-login rule (Option B hard-flip).
--
-- Jorge: a driver with no Samsara login for ~2-3 weeks is gone (a return is a rehire, not "still active").
-- Driver Profiles will show "Last login: MM/DD/YYYY CT" and, on the cadence, hard-flip drivers whose last
-- login is before the configurable cutoff (default 2026-05-31) to status='Inactive' + deactivated_at.
--
-- SOURCE (honest finding): Samsara's /fleet/drivers API exposes NO clean "last login / lastActiveTime" field.
-- The authoritative "last Samsara login" we already ingest is the ELD VEHICLE LOGIN —
-- telematics.vehicle_driver_assignments.started_at (the pairing worker) — optionally MAX'd with the latest
-- hos.duty_status_events.started_at. The refresh job (separate, gated) will populate this column from those
-- already-ingested feeds; NO new Samsara call is invented.
--
-- This migration is ADDITIVE + idempotent + mdata-only (disjoint from accounting / Path B). The column
-- inherits mdata.drivers' existing GRANTs (table granted to ih35_app since 0008) — no new GRANT required.
-- Reversible: ALTER TABLE mdata.drivers DROP COLUMN last_samsara_login_at;  (and DROP INDEX).
BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS last_samsara_login_at timestamptz NULL;

COMMENT ON COLUMN mdata.drivers.last_samsara_login_at IS
  'Most recent Samsara ELD login (max of vehicle_driver_assignments.started_at / latest HOS duty event). '
  'NULL = never seen logging in. Feeds the inactivity-by-login rule (status->Inactive when before the cutoff).';

-- Supports the cutoff scan (find drivers whose last login is before the cutoff, per entity).
CREATE INDEX IF NOT EXISTS idx_mdata_drivers_last_samsara_login
  ON mdata.drivers (operating_company_id, last_samsara_login_at);

COMMIT;
