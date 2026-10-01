-- DO NOT RUN ON PROD — HELD (db/migrations/.held-migrations.json). Measured 2026-10-01 06:40Z and 06:46Z: the
-- prod pre-deploy failed twice on "canceling statement due to lock timeout" at this file — ALTER TABLE
-- mdata.loads needs an ACCESS EXCLUSIVE lock, and a pgbouncer session (pid 24562, neondb_owner) had held a
-- transaction on mdata.loads open for 58 minutes, so the 5 s lock_timeout can never be met and every
-- seat's deploy was blocked. Runs on a Neon branch / in a quiet window by hand once that long transaction
-- is found and closed, then ledger-backfilled. The code feature-detects these columns (storageReady): the
-- read route computes on demand and the writer cron is a no-op until they exist.
--
-- 202615160000_load_real_driven_miles.sql
-- ORDER-2026-09-04 (three-mile CPM): practical (billed) and short (paid) miles are stored on every load;
-- REAL DRIVEN miles were stored nowhere. Measured on 37 signed settlements: driven exceeded paid by 5.3%.
-- These columns hold the odometer-measured miles per leg and per load. NULL means NOT MEASURED and must
-- carry a reason -- never zero, never copied from practical or short. Written only by the load real-driven
-- miles engine (apps/backend/src/telematics/load-real-driven-miles.service.ts).
-- Leg = stop k-1 departure -> stop k arrival (loaded); the first stop's leg is the deadhead from the unit's
-- previous load. Load total = sum of the LOADED legs (compares with practical); loaded + the stop-1 deadhead
-- leg compares with short (= miles_shortest + miles_deadhead).
-- Additive, nullable, no default (metadata-only ALTER); lock_timeout so it never queues behind traffic.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS miles_driven_actual numeric(10,1);
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS miles_driven_actual_source text;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS miles_driven_actual_reason text;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS miles_driven_actual_computed_at timestamptz;

ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS leg_miles_driven_actual numeric(10,1);
ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS leg_miles_driven_actual_source text;
ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS leg_miles_driven_actual_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_miles_driven_actual_null_has_reason' AND conrelid = 'mdata.loads'::regclass) THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_miles_driven_actual_null_has_reason
      CHECK (miles_driven_actual_computed_at IS NULL
             OR (miles_driven_actual IS NOT NULL AND miles_driven_actual >= 0 AND miles_driven_actual_source IS NOT NULL)
             OR (miles_driven_actual IS NULL AND miles_driven_actual_reason IS NOT NULL))
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_leg_miles_driven_actual_null_has_reason' AND conrelid = 'mdata.load_stops'::regclass) THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_leg_miles_driven_actual_null_has_reason
      CHECK ((leg_miles_driven_actual IS NULL AND leg_miles_driven_actual_source IS NULL)
             OR (leg_miles_driven_actual IS NOT NULL AND leg_miles_driven_actual >= 0 AND leg_miles_driven_actual_source IS NOT NULL))
      NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_miles_driven_actual_null_has_reason;
ALTER TABLE mdata.load_stops VALIDATE CONSTRAINT load_stops_leg_miles_driven_actual_null_has_reason;

COMMENT ON COLUMN mdata.loads.miles_driven_actual IS
  'Real driven LOADED miles (odometer), sum of the load''s loaded legs; deadhead lives on the first stop''s leg. NULL = not measured; see miles_driven_actual_reason. Never practical/short.';
COMMENT ON COLUMN mdata.loads.miles_driven_actual_reason IS 'Why miles_driven_actual is NULL (first unmeasurable leg).';
COMMENT ON COLUMN mdata.load_stops.leg_miles_driven_actual IS
  'Real driven miles from the previous stop''s departure (or the unit''s previous load, for the first stop) to this stop''s arrival. NULL = not measured.';

COMMIT;
