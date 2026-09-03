-- GO-19-2b Section 2 (owner 2026-09-03): short_miles comes back NULL and stays NULL until a
-- trustworthy shortest-miles source exists. NEVER derive it from practical + empty -- that was
-- the original AlwaysTrack "St. Miles" bug (St.Miles = L.Miles + E.Miles, not a real shortest
-- route). Pay on LOADED MILES plus a DEADHEAD LINE; the column stays honest until a real source
-- lands. This CHECK constraint enforces the ONE invariant that must always hold when a value IS
-- present: short_miles can never exceed practical_miles.
--
-- CANONICAL-CHECK: idempotent, CREATE-only. catalogs.lane_mileage already exists (202613342200),
-- already FORCED RLS, already granted. This adds one constraint, nothing else.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lane_mileage_short_miles_not_over_practical'
  ) THEN
    ALTER TABLE catalogs.lane_mileage
      ADD CONSTRAINT lane_mileage_short_miles_not_over_practical
      CHECK (short_miles IS NULL OR short_miles <= practical_miles);
  END IF;
END $$;

COMMIT;
