-- DSP-F7362-D1-LOAD-STOP-SOURCE-SCHEMA-MISSING (GO-DWELL-01 D-1) — mdata.load_stops.actual_arrival_at
-- / actual_departure_at have always been plain timestamptz columns with no record of WHO/WHAT wrote
-- them. GO-DWELL-01's root finding: of 86 live USMCA load_stops, actual_arrival_at is set on only 3,
-- and 20 of the actual_departure_at values are FABRICATED — a backfill stamping now() (the same
-- literal timestamp appears on stops in different cities on different loads, which is physically
-- impossible for one truck). D-1's own rule: "Record the SOURCE of each timestamp (driver_app |
-- eld_geofence | manual) — a KPI built on unattributed times is not auditable."
--
-- Codex's D-1 writer feature (driver-app arrive/depart button, Samsara/ELD geofence enter/exit,
-- dispatcher manual entry with actor+reason) is code-complete in isolation but lane-gated:
-- verify-migration-lane-band correctly rejects Codex-authored SQL in this migration-number band.
-- This migration was claimed on main as 202613280900 (db/migrations/CLAIMED-MIGRATION-NUMBERS.json,
-- purpose "d1_load_stop_arrival_departure_source_attribution") and ownership routed to CC-1
-- (docs/bus/INBOX-CC-1.md, docs/audit/GUARD-WORKORDERS.md DSP-F7362-D1-LOAD-STOP-SOURCE-SCHEMA-MISSING)
-- purely because of the authoring-band restriction — the feature and its writers remain Codex's.
--
-- SCHEMA: two nullable text columns paired 1:1 with the timestamp they attribute
-- (actual_arrival_source with actual_arrival_at, actual_departure_source with actual_departure_at),
-- each CHECK-constrained to the three named sources plus NULL (a stop with no captured arrival/
-- departure yet legitimately has no source either). Paired CHECKs (mirroring the established
-- journal_entry_postings.entity_type/entity_uuid pattern) forbid a timestamp with no attributed
-- source and a source with no timestamp — the same ambiguity D-1 exists to remove.
--
-- NO BACKFILL (explicit D-1 instruction: "DO NOT backfill history. Leave the past NULL and let the
-- UI say 'not captured.'"). The existing fabricated actual_departure_at values on 20 stops are left
-- exactly as-is by this migration — this is additive schema only, not a data cleanup. Because every
-- existing row has actual_arrival_source/actual_departure_source NULL by construction (new column,
-- no default), and every existing actual_arrival_at/actual_departure_at value also stays whatever it
-- already was, the pair-CHECK as written would reject a pre-existing row that has a timestamp set
-- but (necessarily) no source — so the pair-CHECK is intentionally NOT added in this migration; only
-- the source-vocabulary CHECK is. Enforcing "timestamp implies source" is a job for the writer code
-- (Codex, next) and, if desired later, a NOT VALID constraint validated only against rows written
-- after this migration — never a constraint that would need a backfill to satisfy on landing.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + a DO block that only adds each CHECK constraint when it
-- does not already exist (Postgres has no ADD CONSTRAINT IF NOT EXISTS). No DROP, no data change,
-- no grant change (new columns inherit the table's existing grants via migration 0065's DEFAULT
-- PRIVILEGES on the mdata schema).

BEGIN;

ALTER TABLE mdata.load_stops
  ADD COLUMN IF NOT EXISTS actual_arrival_source text,
  ADD COLUMN IF NOT EXISTS actual_departure_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'load_stops_actual_arrival_source_check'
       AND conrelid = 'mdata.load_stops'::regclass
  ) THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_actual_arrival_source_check
      CHECK (actual_arrival_source IS NULL OR actual_arrival_source IN ('driver_app', 'eld_geofence', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'load_stops_actual_departure_source_check'
       AND conrelid = 'mdata.load_stops'::regclass
  ) THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_actual_departure_source_check
      CHECK (actual_departure_source IS NULL OR actual_departure_source IN ('driver_app', 'eld_geofence', 'manual'));
  END IF;
END $$;

COMMIT;
