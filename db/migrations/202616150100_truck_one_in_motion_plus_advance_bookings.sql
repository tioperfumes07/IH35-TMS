-- 202616150100_truck_one_in_motion_plus_advance_bookings.sql  (CC-3, claimed on main first — LEAD 443.244)
-- OWNER (verbatim 2026-10-22 2:10 PM CT): "yes it should. remember we might book a load in advance etc."
-- RULE (permanent): a truck (and driver) holds ONE load IN MOTION (dispatched / at_pickup / in_transit / at_delivery) PLUS any
-- number of loads booked in advance (assigned / assigned_not_dispatched). The unit backstops refused ANY second load in
-- assigned_not_dispatched too, so 13693 could not be booked as T177's next load behind 13690 (in transit).
--
-- THIS MIGRATION: both unit backstops (mdata.refuse_second_active_load_on_unit — deferred constraint trigger — and
-- mdata.refuse_overlapping_unit_assignment — date window) consider only loads IN MOTION:
--   * an advance booking (assigned / assigned_not_dispatched) on a truck that is in motion -> allowed;
--   * two loads in motion on one truck -> refused (unchanged);
--   * an advance load moved to dispatched while the truck's current load is still in motion -> refused at COMMIT (it is
--     now in motion and clashes with the in-motion one) until the current one delivers.
-- The same-tour sequential-leg exception and the per-unit advisory lock are unchanged. Mirrors
-- apps/backend/src/dispatch/unit-active-load-guard.ts ACTIVE_UNIT_STATUSES (lockstep: scripts/verify-unit-single-active-load.mjs).
--
-- IDEMPOTENT + FRESH-DB SAFE: CREATE OR REPLACE; DROP TRIGGER IF EXISTS + CREATE; to_regclass guard. No data change.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

CREATE OR REPLACE FUNCTION mdata.refuse_second_active_load_on_unit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cur record;
  clash record;
BEGIN
  -- the row's state at COMMIT (deferred): tour and stops are written after the INSERT.
  SELECT l.id, l.assigned_unit_id, l.status, l.soft_deleted_at, l.load_number
    INTO cur
    FROM mdata.loads l
   WHERE l.id = NEW.id;
  IF cur.id IS NULL OR cur.assigned_unit_id IS NULL OR cur.soft_deleted_at IS NOT NULL
     OR cur.status::text NOT IN ('dispatched','at_pickup','in_transit','at_delivery') THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mdata.loads.unit:' || cur.assigned_unit_id::text));
  SELECT l.load_number
    INTO clash
    FROM mdata.loads l
   WHERE l.id <> cur.id
     AND l.assigned_unit_id = cur.assigned_unit_id
     AND l.soft_deleted_at IS NULL
     AND l.status::text IN ('dispatched','at_pickup','in_transit','at_delivery')
     AND NOT mdata.unit_legs_are_same_tour_sequential(l.id, cur.id)
   LIMIT 1;
  IF clash.load_number IS NOT NULL THEN
    RAISE EXCEPTION 'unit_already_active_on_load: unit is already active on load % (load %) — not a same-tour sequential leg',
      clash.load_number, cur.load_number
      USING ERRCODE = '23505';
  END IF;
  RETURN NULL;
END;
$function$;

-- the date-window trigger: same in-motion set (an advance booking never clashes on dates with the load in motion).
CREATE OR REPLACE FUNCTION mdata.refuse_overlapping_unit_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ DECLARE my_start date; my_end date; clash record; BEGIN IF NEW.assigned_unit_id IS NULL OR NEW.soft_deleted_at IS NOT NULL THEN RETURN NEW; END IF; IF NEW.status NOT IN ('dispatched','at_pickup','in_transit','at_delivery') THEN RETURN NEW; END IF; SELECT min(s.scheduled_arrival_at)::date, max(s.scheduled_arrival_at)::date INTO my_start, my_end FROM mdata.load_stops s WHERE s.load_id = NEW.id; IF my_start IS NULL OR my_end IS NULL THEN RETURN NEW; END IF; SELECT l.load_number, o.starts, o.ends INTO clash FROM mdata.loads l JOIN LATERAL (SELECT min(s.scheduled_arrival_at)::date AS starts, max(s.scheduled_arrival_at)::date AS ends FROM mdata.load_stops s WHERE s.load_id = l.id) o ON TRUE WHERE l.id <> NEW.id AND l.assigned_unit_id = NEW.assigned_unit_id AND l.soft_deleted_at IS NULL AND l.status IN ('dispatched','at_pickup','in_transit','at_delivery') AND o.starts IS NOT NULL AND daterange(o.starts, o.ends, '[)') && daterange(my_start, my_end, '[)') LIMIT 1; IF clash.load_number IS NOT NULL THEN RAISE EXCEPTION 'unit already on active load % over % .. % (this load % .. %)', clash.load_number, clash.starts, clash.ends, my_start, my_end; END IF; RETURN NEW; END; $function$;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_refuse_overlapping_unit_assignment ON mdata.loads;
    CREATE TRIGGER trg_refuse_overlapping_unit_assignment
      BEFORE INSERT OR UPDATE OF assigned_unit_id, status ON mdata.loads
      FOR EACH ROW EXECUTE FUNCTION mdata.refuse_overlapping_unit_assignment();

    DROP TRIGGER IF EXISTS trg_refuse_second_active_load_on_unit ON mdata.loads;
    CREATE CONSTRAINT TRIGGER trg_refuse_second_active_load_on_unit
      AFTER INSERT OR UPDATE OF assigned_unit_id, status, soft_deleted_at, tour_id ON mdata.loads
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION mdata.refuse_second_active_load_on_unit();
  END IF;
END $$;

COMMIT;
