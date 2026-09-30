-- 202614950000_odometer_readings_gap_rows_and_date_grain_idemp.sql
-- ROUND 297.1 (Claude Lead, owner-approved, deadline 2026-10-01T22:00Z) -- J-1 daily odometer
-- snapshot cron.
--
-- MEASURED LIVE before writing this (br-fancy-credit-akjnd07a):
--   telematics.odometer_readings.odometer_miles  NOT NULL
--   odometer_readings_unit_id_read_at_source_key  UNIQUE(unit_id, read_at, source) -- exact
--     timestamp, not date-grain
--
-- J-1's own spec: "a unit whose odometer_mi IS NULL gets a row with odometer_miles NULL and
-- confidence='suggested' -- the gap is RECORDED, never skipped, never interpolated" and "IDEMP
-- unique on (operating_company_id, unit_id, read_at::date, source)". Neither is possible against
-- the live schema as it stands: a NOT NULL column refuses the gap row outright, and the existing
-- unique constraint is finer-grained (exact timestamp) than the day-grain idempotency the cron
-- needs for its ON CONFLICT upsert.
--
-- SCOPE: three additive DDL changes, no data touched, existing rows unaffected by any of them.
--   (a) DROP NOT NULL on odometer_miles -- a gap row legitimately carries no value.
--   (b) telematics.odometer_reading_day(timestamptz) -- a tiny IMMUTABLE wrapper. Postgres refuses
--       a bare (read_at::date) in an index expression ("functions in index expression must be
--       marked IMMUTABLE") because a plain ::date cast is timezone-session-dependent; wrapping it
--       AT TIME ZONE 'UTC' first makes the result deterministic regardless of session timezone,
--       which is what the IMMUTABLE marker requires -- confirmed live against production while
--       writing this migration (the bare form was tried first and refused with exactly that error).
--   (c) a NEW PARTIAL unique index at (operating_company_id, unit_id,
--       odometer_reading_day(read_at), source), scoped WHERE read_at >= this migration's own apply
--       date, so the daily cron can ON CONFLICT DO NOTHING / DO UPDATE per unit per day per source
--       (UTC day boundary, matching the cron's own America/Chicago schedule closely enough that a
--       single daily 03:00 CT tick never crosses two UTC days) for every row it writes from today
--       onward. The PARTIAL scope is required, not cosmetic: live-verified before adding it that an
--       unscoped version of this index fails to create outright -- 921 duplicate
--       (operating_company_id, unit_id, day, source) groups already exist in the 177,906 historical
--       rows (almost entirely source='samsara', written by some now-retired high-frequency poller
--       this repo no longer has any trace of), accounting for 176,960 of the 177,906 rows. Touching
--       or deduplicating that historical data is a separate, real decision outside this migration's
--       scope (and outside the 2026-09-30 owner freeze's spirit on touching existing production
--       records) -- this index simply does not apply to it. The pre-existing exact-timestamp unique
--       constraint (odometer_readings_unit_id_read_at_source_key) is left in place untouched -- it
--       still protects manual/geofence/fuel_receipt/settlement writers that may legitimately write
--       more than once per day; only the new cron path needs day-grain.
--
-- Additive, idempotent (IF NOT EXISTS / CREATE OR REPLACE / conditional DO blocks),
-- CREATE/ALTER-only. No money-app posting path touched (NON-FINANCIAL lane -- telematics schema
-- only).

BEGIN;

ALTER TABLE telematics.odometer_readings
  ALTER COLUMN odometer_miles DROP NOT NULL;

CREATE OR REPLACE FUNCTION telematics.odometer_reading_day(p_read_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_read_at AT TIME ZONE 'UTC')::date;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS odometer_readings_oci_unit_date_source_key
  ON telematics.odometer_readings (operating_company_id, unit_id, telematics.odometer_reading_day(read_at), source)
  WHERE read_at >= '2026-09-30T00:00:00Z'::timestamptz;

COMMIT;
