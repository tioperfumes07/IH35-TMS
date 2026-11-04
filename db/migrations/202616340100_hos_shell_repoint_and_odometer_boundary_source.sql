-- Rows 93 / 116 (LEAD, owner 11-03 13:31 CT "you are the lead, you can do anything necessary").
--
-- (1) ROW 93 — hos.duty_status_events is append-only (0219: every UPDATE / DELETE raises). The driver merge engine
--     (mdata/driver-merge.service.ts repointAll) therefore recorded the HOS ledger as "history_kept" and left every duty
--     event on the merged-away record. Measured 11-03 on prod, USMCA: 9,035 duty events sit on 15 merged shells
--     (mdata.drivers.merged_into_driver_id set), invisible to every HOS reader that keys on the survivor.
--     THE CARVE-OUT: exactly one UPDATE is admitted — driver_id moves from a merged shell to THAT shell's survivor
--     (OLD.driver_id's merged_into_driver_id = NEW.driver_id, same company), and every other column is unchanged.
--     Duty status, times, unit, odometer, location and source stay immutable; DELETE stays refused. The unique natural key
--     (hos_duty_status_events_dedupe) still refuses a move onto an event the survivor already holds — that shell copy is
--     an exact duplicate and stays where it is (never deleted).
--
-- (2) ROW 116 (ENG-29 / E11) — odometer_readings_oci_unit_date_source_key allows ONE 'samsara' row per unit per UTC day
--     (from 2026-09-30, built for the daily odometer snapshot). The E11 boundary backfill stores Samsara's own reads at a
--     stop boundary under the same source, so on any day the snapshot already wrote, the boundary read could not be stored
--     and the planner never asked (measured on a prod fork 11-03: 3 of the 4 open odometer gaps, loads 13657 and one more,
--     sit on a day whose 'samsara' slot is the 17:39Z snapshot). Boundary reads get their own source 'samsara_boundary',
--     outside the per-day key (the per-instant key odometer_readings_unit_id_read_at_source_key still dedupes them).
--     The anchor rule (odometer-anchor.ts) reads every source with confidence measured / entered — unchanged.
--     odometer-manual-upsert.service.ts names the same predicate in its ON CONFLICT target (same PR).
--
-- IDEMPOTENT + FRESH-DB SAFE: CREATE OR REPLACE FUNCTION; DROP CONSTRAINT IF EXISTS + ADD (superset list);
-- DROP INDEX IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS; every block guarded by to_regclass.

CREATE OR REPLACE FUNCTION hos.block_duty_status_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.driver_id IS DISTINCT FROM OLD.driver_id
     AND NEW.id = OLD.id
     AND NEW.operating_company_id = OLD.operating_company_id
     AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
     AND NEW.duty_status = OLD.duty_status
     AND NEW.started_at = OLD.started_at
     AND NEW.ended_at IS NOT DISTINCT FROM OLD.ended_at
     AND NEW.source = OLD.source
     AND NEW.odometer_mi IS NOT DISTINCT FROM OLD.odometer_mi
     AND NEW.location IS NOT DISTINCT FROM OLD.location
     AND NEW.created_at = OLD.created_at
     AND EXISTS (
       SELECT 1 FROM mdata.drivers shell
        WHERE shell.id = OLD.driver_id
          AND shell.merged_into_driver_id = NEW.driver_id
          AND shell.operating_company_id = OLD.operating_company_id
     )
  THEN
    RETURN NEW; -- merged shell -> its survivor; nothing else about the event changes
  END IF;
  RAISE EXCEPTION 'hos.duty_status_events is append-only — % is not allowed', TG_OP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('telematics.odometer_readings') IS NOT NULL THEN
    ALTER TABLE telematics.odometer_readings DROP CONSTRAINT IF EXISTS odometer_readings_source_check;
    ALTER TABLE telematics.odometer_readings ADD CONSTRAINT odometer_readings_source_check
      CHECK (source = ANY (ARRAY['samsara'::text, 'geofence'::text, 'manual'::text, 'fuel_receipt'::text, 'settlement'::text, 'samsara_boundary'::text]));
    DROP INDEX IF EXISTS telematics.odometer_readings_oci_unit_date_source_key;
    CREATE UNIQUE INDEX IF NOT EXISTS odometer_readings_oci_unit_date_source_key
      ON telematics.odometer_readings (operating_company_id, unit_id, telematics.odometer_reading_day(read_at), source)
      WHERE read_at >= '2026-09-30 00:00:00+00'::timestamptz AND source <> 'samsara_boundary';
  END IF;
END $$;
