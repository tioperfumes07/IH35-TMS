-- 202615191100_border_crossing_events_customs_link.sql -- E-29 addition (claim #23926).
-- A border crossing the GPS detector saw (dispatch.border_crossing_events) and the crossing the office declared in
-- the border wizard (mdata.unit_border_crossings: manifest, ACE e-manifest, customs broker + status, port, bond)
-- were never connected. One nullable FK on the detected event -> its declared customs record; the detector fills it
-- only on a UNIQUE match (same load, same direction, within 24 hours of the declared / planned crossing date; or, for
-- an event with no load, same truck + direction + window). Reverse: the declaration reads its detected crossing.
-- Additive; no rows changed by the migration.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE dispatch.border_crossing_events
  ADD COLUMN IF NOT EXISTS unit_border_crossing_id uuid NULL REFERENCES mdata.unit_border_crossings(id);
CREATE INDEX IF NOT EXISTS border_crossing_events_unit_border_crossing_idx
  ON dispatch.border_crossing_events (unit_border_crossing_id);

COMMENT ON COLUMN dispatch.border_crossing_events.unit_border_crossing_id IS
  'E-29: the declared customs record (border wizard) this detected crossing fulfils; set on a unique load/direction/date match only.';

COMMIT;
