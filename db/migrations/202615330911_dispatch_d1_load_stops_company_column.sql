-- 202615330911 · CC-3 · Dispatch D1 — mdata.load_stops carried NO operating_company_id: a stop reached its company only
-- through the RLS policy's join to mdata.loads, so no key, no foreign key and no report could scope a stop by company
-- on its own (standing order point 7: operating_company_id NOT NULL on every table).
-- Measured on prod under SET LOCAL app.bypass_rls = 'lucia' (2026-10-03): 382 stops, all on USMCA loads, 0 orphans.
--   * the company is DERIVED from the stop's load by a BEFORE trigger, so the 6 writers that insert stops are unchanged;
--     a writer that names a different company than its load is refused (23514);
--   * backfill with trg_load_stops_updated_at and trg_refresh_is_extra_stop held off (the refresh's own UPDATE stamps
--     updated_at; the backfill changes no stop membership, so is_extra_stop is unchanged) — no stop's updated_at moves;
--   * CHECK company present (validated), then SET NOT NULL.
-- Idempotent.

SELECT set_config('app.bypass_rls', 'lucia', true);

ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS operating_company_id uuid;

CREATE OR REPLACE FUNCTION mdata.load_stops_derive_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT l.operating_company_id INTO v_company FROM mdata.loads l WHERE l.id = NEW.load_id;
  IF v_company IS NOT NULL AND NEW.operating_company_id IS NOT NULL AND NEW.operating_company_id <> v_company THEN
    RAISE EXCEPTION 'load_stops.operating_company_id % does not match its load''s company %', NEW.operating_company_id, v_company
      USING ERRCODE = '23514';
  END IF;
  NEW.operating_company_id := COALESCE(v_company, NEW.operating_company_id);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_load_stops_derive_company ON mdata.load_stops;
CREATE TRIGGER trg_load_stops_derive_company
  BEFORE INSERT OR UPDATE OF load_id, operating_company_id ON mdata.load_stops
  FOR EACH ROW EXECUTE FUNCTION mdata.load_stops_derive_company();

ALTER TABLE mdata.load_stops DISABLE TRIGGER trg_load_stops_updated_at;
ALTER TABLE mdata.load_stops DISABLE TRIGGER trg_refresh_is_extra_stop;
UPDATE mdata.load_stops s
   SET operating_company_id = l.operating_company_id
  FROM mdata.loads l
 WHERE l.id = s.load_id AND s.operating_company_id IS DISTINCT FROM l.operating_company_id;
ALTER TABLE mdata.load_stops ENABLE TRIGGER trg_refresh_is_extra_stop;
ALTER TABLE mdata.load_stops ENABLE TRIGGER trg_load_stops_updated_at;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.load_stops'::regclass AND conname = 'load_stops_company_required') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.load_stops VALIDATE CONSTRAINT load_stops_company_required;
ALTER TABLE mdata.load_stops ALTER COLUMN operating_company_id SET NOT NULL;
