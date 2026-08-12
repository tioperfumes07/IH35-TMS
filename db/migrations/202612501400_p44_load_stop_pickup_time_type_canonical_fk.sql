-- P44 Lists Wave A — make catalogs.pickup_time_types a real Book Load dependency.
-- The legacy time_window_type remains the appointment-window mode. This UUID records the canonical
-- pickup handling/time catalog row. Entity parity is derived through load_id, avoiding redundant
-- company data and any production-row backfill.
BEGIN;

ALTER TABLE mdata.load_stops
  ADD COLUMN IF NOT EXISTS pickup_time_type_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_pickup_time_type_fk') THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_pickup_time_type_fk
      FOREIGN KEY (pickup_time_type_id)
      REFERENCES catalogs.pickup_time_types(id);
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION mdata.enforce_load_stop_pickup_time_type_company()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_load_company uuid;
  v_catalog_company uuid;
BEGIN
  IF NEW.pickup_time_type_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT operating_company_id INTO v_load_company FROM mdata.loads WHERE id = NEW.load_id;
  SELECT operating_company_id INTO v_catalog_company FROM catalogs.pickup_time_types WHERE id = NEW.pickup_time_type_id;
  IF v_load_company IS NULL OR v_catalog_company IS NULL OR v_load_company <> v_catalog_company THEN
    RAISE EXCEPTION 'pickup_time_type_id must belong to the load operating company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_load_stops_pickup_time_type_company ON mdata.load_stops;
CREATE CONSTRAINT TRIGGER trg_load_stops_pickup_time_type_company
AFTER INSERT OR UPDATE OF load_id, pickup_time_type_id ON mdata.load_stops
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION mdata.enforce_load_stop_pickup_time_type_company();

CREATE INDEX IF NOT EXISTS idx_load_stops_pickup_time_type
  ON mdata.load_stops (pickup_time_type_id)
  WHERE pickup_time_type_id IS NOT NULL;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_pickup_time_type_fk') THEN
    RAISE EXCEPTION 'P44 pickup-time linkage: canonical FK missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_load_stops_pickup_time_type_company') THEN
    RAISE EXCEPTION 'P44 pickup-time linkage: same-company constraint trigger missing';
  END IF;
END
$verify$;

COMMIT;
