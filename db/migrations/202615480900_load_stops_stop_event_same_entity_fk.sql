-- 202615480900_load_stops_stop_event_same_entity_fk.sql
-- CC-3 · ROUND 443.28. 202615460900 (ROUND 443.16) added mdata.load_stops.actual_stop_event_id with a single-column FK
-- to telematics.unit_stop_events(id). Both tables carry operating_company_id, and verify-money-lines-same-entity-fks
-- (ROUND 345 — "block from having post on another company") requires a VALIDATED composite (operating_company_id, ref)
-- FK so a load stop can never be stamped by another company's truck stop. Measured on prod 2026-10-11 00:20 UTC:
-- 0 load_stops reference a stop event; 781 unit_stop_events, 0 with a NULL company. Additive, idempotent, writes no rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_stop_events_operating_company_id_id_key') THEN
    ALTER TABLE telematics.unit_stop_events
      ADD CONSTRAINT unit_stop_events_operating_company_id_id_key UNIQUE (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_actual_stop_event_same_entity_fkey') THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_actual_stop_event_same_entity_fkey
      FOREIGN KEY (operating_company_id, actual_stop_event_id)
      REFERENCES telematics.unit_stop_events (operating_company_id, id);
  END IF;
END $$;

COMMIT;
