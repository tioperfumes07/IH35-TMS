-- DRIVER-COMPLIANCE-01 (Claude Lead, 2026-09-11): the quarantine_test_fixture=true path on
-- POST /api/v1/mdata/drivers/:id/deactivate (apps/backend/src/mdata/drivers.routes.ts) writes
-- status_locked_reason = 'test_fixture_quarantine' -- but migration 202613980000's
-- drivers_status_locked_reason_check only ever allowed ('manual_deactivate', 'samsara_deactivated').
-- Live-confirmed: every quarantine_test_fixture=true call has 500'd with 23514 since that code
-- path was built (pre-existing, unrelated to this session's own changes) -- the entire "quarantine
-- a known test/junk driver row as is_sample_data=true instead of deleting it" feature has never
-- worked. Additive-only: widen the CHECK to admit the 3rd, already-shipped, already-written value.
BEGIN;

ALTER TABLE mdata.drivers
  DROP CONSTRAINT IF EXISTS drivers_status_locked_reason_check;

ALTER TABLE mdata.drivers
  ADD CONSTRAINT drivers_status_locked_reason_check
  CHECK (status_locked_reason IS NULL OR status_locked_reason IN ('manual_deactivate', 'samsara_deactivated', 'test_fixture_quarantine'));

COMMENT ON COLUMN mdata.drivers.status_locked_reason IS
  'Why status_locked_at is set: manual_deactivate (owner used the TMS /deactivate action), samsara_deactivated (Samsara driver-mirror collector observed driverActivationStatus=deactivated for this linked driver), or test_fixture_quarantine (the same /deactivate route with quarantine_test_fixture=true, for an unmistakable test/junk driver row with zero real FK activity -- is_sample_data set true in the same write, never deleted).';

COMMIT;
