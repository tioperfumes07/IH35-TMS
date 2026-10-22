-- 202616160100_load_shuttle_legs_stop_event_fk.sql  (CC-3, claimed on main first — LEAD 443.248)
-- verify-orphan-fk-inventory: 202616130100_load_shuttle_legs.sql created dispatch.load_shuttle_legs.stop_event_id (the shuttle
-- unit's GPS stop event that proves a 'tracked' leg) with no FOREIGN KEY — an orphan-able pointer. Measured on prod before this
-- migration: 0 rows whose stop_event_id names a missing telematics.unit_stop_events row.
-- ADDITIVE + IDEMPOTENT + FRESH-DB SAFE: the constraint is added only when both tables exist and it is not already there.
BEGIN;
SET LOCAL lock_timeout = '60s';
DO $$
BEGIN
  IF to_regclass('dispatch.load_shuttle_legs') IS NOT NULL AND to_regclass('telematics.unit_stop_events') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_load_shuttle_legs_stop_event'
                       AND conrelid = 'dispatch.load_shuttle_legs'::regclass) THEN
    ALTER TABLE dispatch.load_shuttle_legs
      ADD CONSTRAINT fk_load_shuttle_legs_stop_event
      FOREIGN KEY (stop_event_id) REFERENCES telematics.unit_stop_events(id);
  END IF;
END $$;
COMMIT;
