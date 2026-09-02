-- GO-21 B5 (owner direct instruction 2026-09-02): "Driver pay rate is typed into the wizard. It
-- must resolve automatically from the driver profile. A hand-typed pay rate is how a settlement
-- goes silently wrong: nothing downstream can tell a typo from an override. Resolve from the
-- driver record. If an override is genuinely needed it is an explicit, logged, reason-carrying
-- override — never a bare editable box that looks like data entry."
--
-- mdata.loads.driver_pay_rate_per_mile already exists (migration 202609170000) and was previously
-- read FIRST by resolveDriverBasePayCents (apps/backend/src/dispatch/book-load.service.ts),
-- outranking driver_finance.driver_pay_rates (the driver's real profile rate) unconditionally.
-- This migration adds the one column that turns a bare typed number into a real override: a
-- required reason. The application-layer fix (flip the resolution priority, require this reason,
-- log every override via appendCrudAudit) ships in the same PR as this migration.
--
-- Additive, idempotent, no data touched.

BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS driver_pay_rate_override_reason text NULL;

COMMENT ON COLUMN mdata.loads.driver_pay_rate_override_reason IS
  'GO-21 B5 -- required whenever driver_pay_rate_per_mile is used as an explicit override of the driver''s driver_finance.driver_pay_rates profile card. A typed rate with no reason here is never used for pay (falls back to the profile rate, or null).';

COMMIT;
