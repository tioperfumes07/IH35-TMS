-- 202616050700_unit_overlap_trigger_tracked_same_tour_legs.sql  (CC-2, claimed on main first — LEAD 443.209, moved from Codex)
-- LEAD 10-21 20:32Z: 13694 (T148, Avenel NJ pickup 10-20, TR) is the next leg of 13688's tour (T148, delivers Swedesboro NJ
-- 10-19, still dispatched in AlwaysTrack). "a load on the same tour whose pickup is after the prior leg's scheduled
-- delivery is not an overlap." Owner 2026-09-10 (lock the trucks): "once a truck is dispatched on a load it can't be
-- silently reassigned or double-booked" — the DB backstop stays strict.
--
-- MEASURED on prod (br-fancy-credit-akjnd07a, read-only, 10-21):
--   * uq_loads_one_active_unit (202614042200) is ABSENT on prod; prod's DB backstop is an UNTRACKED trigger
--     trg_refuse_overlapping_unit_assignment (date-window overlap only; skips a load with no stops — every Book Load
--     INSERT, whose stops are written after the row). A fresh database has the index and not the trigger.
--   * 0 USMCA units hold more than one active load today.
--
-- THIS MIGRATION — one rule, every database:
--   1. mdata.unit_legs_are_same_tour_sequential(a, b): both loads on the same non-null tour, every stop of both carries a
--      scheduled time, and one load's last stop time is at or before the other's first pickup time.
--   2. mdata.refuse_second_active_load_on_unit(): DEFERRED constraint trigger (runs at COMMIT, after the post-insert
--      tour / stops writes): an active load's unit may not be active on any other load unless the two are same-tour
--      sequential legs. pg_advisory_xact_lock per unit serializes concurrent bookings (what the unique index did).
--      Mirrors dispatch/unit-active-load-guard.ts (assertUnitNotActiveOnAnotherLoad + same_tour_next_leg).
--   3. The prod trigger mdata.refuse_overlapping_unit_assignment is now TRACKED (prod body verbatim) so every database
--      has it.
--   4. DROP INDEX IF EXISTS mdata.uq_loads_one_active_unit — no-op on prod (absent); on a fresh database it is replaced by
--      (2), which is as strict except for the same-tour sequential leg.
--
-- IDEMPOTENT + FRESH-DB SAFE: CREATE OR REPLACE; DROP TRIGGER IF EXISTS + CREATE; DROP INDEX IF EXISTS; to_regclass guards.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

CREATE OR REPLACE FUNCTION mdata.unit_legs_are_same_tour_sequential(a_id uuid, b_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH legs AS (
    SELECT l.id, l.tour_id,
           (SELECT count(*) FROM mdata.load_stops s WHERE s.load_id = l.id) AS stops,
           (SELECT count(*) FROM mdata.load_stops s WHERE s.load_id = l.id
              AND COALESCE(s.appointment_end_at, s.appointment_start_at, s.scheduled_arrival_at) IS NULL) AS untimed,
           (SELECT min(COALESCE(s.appointment_start_at, s.scheduled_arrival_at)) FROM mdata.load_stops s WHERE s.load_id = l.id) AS starts,
           (SELECT max(COALESCE(s.appointment_end_at, s.appointment_start_at, s.scheduled_arrival_at)) FROM mdata.load_stops s WHERE s.load_id = l.id) AS ends
      FROM mdata.loads l
     WHERE l.id IN (a_id, b_id)
  )
  SELECT COALESCE((
    SELECT a.tour_id IS NOT NULL AND a.tour_id = b.tour_id
       AND a.stops > 0 AND b.stops > 0 AND a.untimed = 0 AND b.untimed = 0
       AND (a.ends <= b.starts OR b.ends <= a.starts)
      FROM legs a, legs b
     WHERE a.id = a_id AND b.id = b_id
  ), false);
$function$;

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
     OR cur.status::text NOT IN ('assigned','assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery') THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mdata.loads.unit:' || cur.assigned_unit_id::text));
  SELECT l.load_number
    INTO clash
    FROM mdata.loads l
   WHERE l.id <> cur.id
     AND l.assigned_unit_id = cur.assigned_unit_id
     AND l.soft_deleted_at IS NULL
     AND l.status::text IN ('assigned','assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery')
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

-- prod's date-window trigger, tracked verbatim (it existed only on prod).
CREATE OR REPLACE FUNCTION mdata.refuse_overlapping_unit_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ DECLARE my_start date; my_end date; clash record; BEGIN IF NEW.assigned_unit_id IS NULL OR NEW.soft_deleted_at IS NOT NULL THEN RETURN NEW; END IF; IF NEW.status NOT IN ('assigned','assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery') THEN RETURN NEW; END IF; SELECT min(s.scheduled_arrival_at)::date, max(s.scheduled_arrival_at)::date INTO my_start, my_end FROM mdata.load_stops s WHERE s.load_id = NEW.id; IF my_start IS NULL OR my_end IS NULL THEN RETURN NEW; END IF; SELECT l.load_number, o.starts, o.ends INTO clash FROM mdata.loads l JOIN LATERAL (SELECT min(s.scheduled_arrival_at)::date AS starts, max(s.scheduled_arrival_at)::date AS ends FROM mdata.load_stops s WHERE s.load_id = l.id) o ON TRUE WHERE l.id <> NEW.id AND l.assigned_unit_id = NEW.assigned_unit_id AND l.soft_deleted_at IS NULL AND l.status IN ('assigned','assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery') AND o.starts IS NOT NULL AND daterange(o.starts, o.ends, '[)') && daterange(my_start, my_end, '[)') LIMIT 1; IF clash.load_number IS NOT NULL THEN RAISE EXCEPTION 'unit already on active load % over % .. % (this load % .. %)', clash.load_number, clash.starts, clash.ends, my_start, my_end; END IF; RETURN NEW; END; $function$;

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

DROP INDEX IF EXISTS mdata.uq_loads_one_active_unit;

COMMIT;
