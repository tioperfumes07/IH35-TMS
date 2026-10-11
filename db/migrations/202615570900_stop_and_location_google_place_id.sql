-- 202615570900_stop_and_location_google_place_id.sql
-- CC-3 for CC-2 · RULING 443.62 #7 (owner order 443.53 #1: addresses from Google). The stop resolver takes a facility's
-- street from Google Places and today records Google's place_id only on the audit row (stops-geocode-backfill.service.ts:
-- "mdata.load_stops has no place_id column"). The place id belongs on the stop and on the location (facility) row, so a
-- stop / fence can be re-resolved and drilled to the same Google place. Additive, nullable, writes no rows; an empty string
-- is refused (a place id is either known or NULL). Measured 2026-10-11: no table carries a place_id column; neither table
-- has a column-allowlist trigger.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS google_place_id text;
ALTER TABLE mdata.locations  ADD COLUMN IF NOT EXISTS google_place_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_google_place_id_not_blank') THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_google_place_id_not_blank CHECK (google_place_id IS NULL OR btrim(google_place_id) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_google_place_id_not_blank') THEN
    ALTER TABLE mdata.locations
      ADD CONSTRAINT locations_google_place_id_not_blank CHECK (google_place_id IS NULL OR btrim(google_place_id) <> '');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS locations_company_google_place_id_idx
  ON mdata.locations (operating_company_id, google_place_id) WHERE google_place_id IS NOT NULL;

COMMENT ON COLUMN mdata.load_stops.google_place_id IS
  '443.62 #7: Google Places place_id the stop''s street / point was taken from (source google_place); NULL when not from Google.';
COMMENT ON COLUMN mdata.locations.google_place_id IS
  '443.62 #7: Google Places place_id of this location (facility); NULL when not from Google.';

COMMIT;
