BEGIN;

-- LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04, URGENT, owner's own error).
-- REVERSES migration 202613670001, applied hours earlier the same session, which dropped
-- catalogs.lane_mileage's practical_miles NOT NULL and the lane_mileage_short_miles_not_over_
-- practical CHECK specifically to let a re-import land. That re-import (39a81f133c, CC-3,
-- executed in good faith on a direct owner instruction) mapped the source CSV's short_miles
-- column verbatim into catalogs.lane_mileage.short_miles. That column is AlwaysTrack St. Miles =
-- Loaded Miles + Empty Miles -- the shortest-plus-deadhead BLEND
-- docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md already forbids storing as one number ("Never
-- derive one mileage from another... we do not store that as one number"). It is not an
-- independent shortest-route figure; there is no shortest-route source anywhere in that CSV. A
-- true loaded-shortest figure comes only from the self-hosted OSM routing engine
-- (apps/backend/src/dispatch/mileage/osrm.provider.ts), not wired into this import.
--
-- Owner's own words, verbatim: "A guard is never dropped to admit data -- the data is wrong, not
-- the guard." The constraint 202613670001 dropped was correct and was doing its job (catching
-- exactly this class of bad data); this migration restores it.
--
-- THREE STEPS, IN ORDER, IDEMPOTENT:
--
-- 1. NULL short_miles / short_min / short_max, reset n_short = 0, across every USMCA
--    catalogs.lane_mileage row. Live-measured immediately before this migration (bypass_rls, run
--    twice, identical): 3,417 lanes, short_miles populated on 3,315, 2,177 with short_miles >
--    practical_miles (the impossible-lane symptom the law names). None of this data has any
--    legitimate shortest-route content -- it is 100% blend, regardless of the per-row
--    short>practical/short<=practical split. Not derived, not capped, not partially kept -- NULL,
--    full stop, matching the pre-2026-09-04-REBUILD correct state (3,092 lanes, short_miles NULL
--    on every row, 0 impossible lanes, per the owner's own §2/§6 citation).
--
-- 2. DELETE the rows whose ONLY data point was the now-nulled short_miles. Live-verified before
--    writing this file: exactly 26 USMCA rows have practical_miles IS NULL, and ALL 26 of those
--    also had short_miles populated (their sole content) -- confirmed 0 rows exist with BOTH
--    fields null before this migration runs. After step 1 nulls short_miles, these 26 rows would
--    carry ZERO legitimate mileage information in either column -- empty husks, not "data to hit
--    a number." This is the only way to truthfully restore practical_miles NOT NULL (a NOT NULL
--    added while NULL rows exist is impossible in Postgres); leaving them in violation, or
--    fabricating a practical_miles value for them, are both worse than removing genuinely empty
--    rows. Several of the 26 are origin==dest same-city "lanes" with no real destination at all
--    (e.g. OTHELLO,WA->OTHELLO,WA), reinforcing that this is not a loss of real lane coverage.
--
-- 3. RESTORE practical_miles NOT NULL and CHECK lane_mileage_short_miles_not_over_practical,
--    byte-identical to their pre-202613670001 definitions (re-verified live via
--    pg_get_constraintdef before either constraint was dropped this session). The CHECK will now
--    trivially hold on every remaining row (short_miles is NULL everywhere after steps 1-2).
--
-- NOT touched by this migration: practical_miles / practical_min / practical_max /
-- practical_spread / n_practical (the real, independent loaded-practical figures this source
-- genuinely carries, never implicated in the blend defect) and empty_miles (live-verified this
-- session: nothing in the codebase reads catalogs.lane_mileage.empty_miles into any pay/cost
-- computation -- GO-23's chain-deadhead is the sole live producer of miles_deadhead -- so
-- empty_miles is unused, not actively wrong in a load-bearing sense; owner's own instruction is
-- not to delete data to hit a number, and this value is informational only).
--
-- Idempotent: the UPDATE/DELETE are no-ops on a second run (nothing left to null/delete); the
-- ALTER COLUMN SET NOT NULL and ADD CONSTRAINT are guarded to skip if already applied.

UPDATE catalogs.lane_mileage
   SET short_miles = NULL,
       short_min = NULL,
       short_max = NULL,
       n_short = 0
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND (short_miles IS NOT NULL OR short_min IS NOT NULL OR short_max IS NOT NULL OR n_short <> 0);

DELETE FROM catalogs.lane_mileage
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND practical_miles IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'catalogs' AND table_name = 'lane_mileage'
       AND column_name = 'practical_miles' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE catalogs.lane_mileage ALTER COLUMN practical_miles SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lane_mileage_short_miles_not_over_practical'
  ) THEN
    ALTER TABLE catalogs.lane_mileage
      ADD CONSTRAINT lane_mileage_short_miles_not_over_practical
      CHECK (short_miles IS NULL OR short_miles <= practical_miles);
  END IF;
END
$$;

COMMENT ON COLUMN catalogs.lane_mileage.short_miles IS
  'Loaded shortest-route miles. ALWAYS NULL from the current AlwaysTrack CSV source -- that source''s short_miles column is St. Miles = Loaded Miles + Empty Miles (the shortest+deadhead blend), not an independent shortest-route figure. Never populated 2026-09-04 (LANE-MILEAGE-SHORT-MILES-REGRESSION, reverses the same-day 202613670001/39a81f133c mistake) -- a true value comes only from the self-hosted OSM routing engine, never from this source.';

COMMIT;
