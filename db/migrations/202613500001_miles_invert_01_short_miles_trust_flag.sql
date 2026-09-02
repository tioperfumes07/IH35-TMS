-- MILES-INVERT-01 (owner direct instruction 2026-09-02, "ALL SEATS — MILES LAW, CORRECTED AND
-- FINAL", supersedes #19740). Measured live on catalogs.lane_mileage before writing this: of 3,237
-- dual-value lanes, 2,142 (66.2%) have short_miles > practical_miles, and on those the gap
-- (avg 224.7mi) tracks empty_miles (avg 269.2mi) — short is carrying practical + deadhead on
-- two-thirds of lanes. A directional round-trip test (352 A->B / B->A pairs) found short_miles
-- disagrees with itself by >100mi on 83% of pairs (35% by >200mi) while practical_miles stays
-- directionally consistent (16% over 50mi). CONCLUSION (owner): short_miles, the column driver pay
-- is computed from, is the untrustworthy one — not a code bug, seed-lane-mileage.mjs maps the
-- historical CSV 1:1; the bad values are historical manual-entry data.
--
-- CC-1 owns the catalog fix. Explicit owner instruction: DO NOT mass-swap rows where
-- short > practical — that assumes the answer and would corrupt the ~1,095 lanes that are
-- correct. Instead: surface untrustworthy lanes so the booking UI (Cursor's GO-16 Rev C
-- lane-mileage.service.ts / MilesStrip — NOT touched by this migration) can flag + require an
-- operator OK before the number feeds a load, without blocking booking and without silently
-- fixing (or silently trusting) a number nobody has verified.
--
-- Two triggers for "untrustworthy", either sets it:
--   1. short_miles > practical_miles on the SAME row.
--   2. The reverse lane's short_miles differs from this lane's by more than 100 miles (matched by
--      the EXACT SAME lower(city)/lower(state) swapped-origin/dest predicate
--      lane-mileage.service.ts's own reverse-lane lookup already uses, so the flag and the fill
--      logic agree on what "the reverse lane" means). Flagging is symmetric — if A->B disagrees
--      with B->A, BOTH rows get flagged, not just one.
--
-- A trigger (not a one-time script) keeps this current for every future INSERT/UPDATE regardless
-- of which caller writes the row (seed-lane-mileage.mjs, a live fill, a manual catalog edit) — one
-- source of truth for the classification logic, never duplicated between a migration script and
-- application code. The migration's own backfill re-uses the trigger itself (a no-op UPDATE forces
-- every existing row through it) rather than a second copy of the same predicate.
--
-- Additive, idempotent, CREATE-only. No new RLS policy needed — lane_mileage already carries
-- FORCED RLS from its origin migration; adding columns + a trigger does not change that.

BEGIN;

ALTER TABLE catalogs.lane_mileage
  ADD COLUMN IF NOT EXISTS short_miles_untrustworthy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS short_miles_untrustworthy_reason text NULL;

CREATE INDEX IF NOT EXISTS ix_lane_mileage_short_untrustworthy
  ON catalogs.lane_mileage (operating_company_id)
  WHERE short_miles_untrustworthy = true;

CREATE OR REPLACE FUNCTION catalogs.recompute_lane_short_miles_trust() RETURNS trigger AS $$
DECLARE
  rev RECORD;
  is_untrustworthy boolean := false;
  reasons text[] := '{}';
BEGIN
  IF NEW.short_miles IS NOT NULL AND NEW.practical_miles IS NOT NULL AND NEW.short_miles > NEW.practical_miles THEN
    is_untrustworthy := true;
    reasons := array_append(reasons, 'short_exceeds_practical');
  END IF;

  -- Same predicate as lane-mileage.service.ts's own "From the reverse lane" lookup — origin/dest
  -- swapped, case-insensitive city/state match, excluding this row itself.
  SELECT id, short_miles INTO rev
    FROM catalogs.lane_mileage
   WHERE operating_company_id = NEW.operating_company_id
     AND lower(origin_city) = lower(NEW.dest_city)
     AND lower(origin_state) = lower(NEW.dest_state)
     AND lower(dest_city) = lower(NEW.origin_city)
     AND lower(dest_state) = lower(NEW.origin_state)
     AND id <> NEW.id
   LIMIT 1;

  IF rev.id IS NOT NULL AND rev.short_miles IS NOT NULL AND NEW.short_miles IS NOT NULL
     AND abs(NEW.short_miles - rev.short_miles) > 100 THEN
    is_untrustworthy := true;
    reasons := array_append(reasons, 'reverse_lane_short_differs_over_100mi');

    -- Flagging is symmetric: the reverse row disagrees with THIS row exactly as much as this row
    -- disagrees with it. Only touch it when it isn't already carrying this same reason, so this
    -- never becomes an infinite trigger ping-pong (this UPDATE fires the trigger on rev.id too,
    -- but the guard below makes the second firing a no-op).
    UPDATE catalogs.lane_mileage
       SET short_miles_untrustworthy = true,
           short_miles_untrustworthy_reason =
             CASE
               WHEN short_miles_untrustworthy_reason IS NULL THEN 'reverse_lane_short_differs_over_100mi'
               WHEN short_miles_untrustworthy_reason NOT LIKE '%reverse_lane_short_differs_over_100mi%'
                 THEN short_miles_untrustworthy_reason || '+reverse_lane_short_differs_over_100mi'
               ELSE short_miles_untrustworthy_reason
             END
     WHERE id = rev.id
       AND (short_miles_untrustworthy = false OR short_miles_untrustworthy_reason NOT LIKE '%reverse_lane_short_differs_over_100mi%');
  END IF;

  NEW.short_miles_untrustworthy := is_untrustworthy;
  NEW.short_miles_untrustworthy_reason := CASE WHEN array_length(reasons, 1) > 0 THEN array_to_string(reasons, '+') ELSE NULL END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lane_mileage_short_miles_trust ON catalogs.lane_mileage;
CREATE TRIGGER trg_lane_mileage_short_miles_trust
  BEFORE INSERT OR UPDATE OF short_miles, practical_miles, origin_city, origin_state, dest_city, dest_state
  ON catalogs.lane_mileage
  FOR EACH ROW EXECUTE FUNCTION catalogs.recompute_lane_short_miles_trust();

-- Backfill every existing row through the trigger — a single source of truth for the
-- classification logic, not a duplicated copy of the same predicate run as a bare UPDATE.
-- Row-by-row, NOT a single mass UPDATE: the trigger's own cross-row UPDATE (propagating the flag
-- onto a lane's reverse counterpart) conflicts with PostgreSQL's mutation rules when the reverse
-- row is ALSO a target of the SAME outer UPDATE statement ("tuple to be updated was already
-- modified by an operation triggered by the current command") — confirmed live against the real
-- 3,237-row catalog before landing this fix. One UPDATE per row keeps every firing its own command.
DO $backfill$
DECLARE
  lane_row RECORD;
BEGIN
  FOR lane_row IN SELECT id FROM catalogs.lane_mileage LOOP
    UPDATE catalogs.lane_mileage SET short_miles = short_miles WHERE id = lane_row.id;
  END LOOP;
END
$backfill$;

COMMENT ON COLUMN catalogs.lane_mileage.short_miles_untrustworthy IS
  'MILES-INVERT-01 (owner 2026-09-02) -- true when short_miles > practical_miles on this row, or the reverse lane''s short_miles differs by more than 100mi. Driver pay is computed from short_miles; an untrustworthy lane must flag on screen and require an operator OK before feeding a load -- never silently mass-corrected, never blocking booking.';
COMMENT ON COLUMN catalogs.lane_mileage.short_miles_untrustworthy_reason IS
  'MILES-INVERT-01 -- which test(s) tripped: short_exceeds_practical and/or reverse_lane_short_differs_over_100mi, +-joined when both.';

COMMIT;
