-- TRIP PAIRING · Block 1 — trip_type + tour data model on mdata.loads.
-- ADDITIVE, idempotent, reversible, per-entity (mdata.loads already carries operating_company_id).
-- Touches NO money posting (Tier-2). Confirmed: no pre-existing trip_type / tour_id column and no
-- tour/trip-group table exists in db/migrations (clean add, nothing to reuse).
--
-- What this models:
--   * trip_type — classifies each load leg: 'NB' Northbound | 'TR' Triangulation | 'SB' Southbound.
--     The column is NULLABLE here (existing rows backfill NULL allowed); NEW loads are REQUIRED to set
--     it — that NOT-NULL-on-create rule is enforced in the API + wizard (Block 2), not as a column
--     constraint (a NOT NULL column would reject the existing NULL rows).
--   * tour_id — groups one unit's NB + n×TR + SB legs into ONE tour (what the Trip Pairing board stacks).
--     An NB leg STARTS a tour (gets a fresh tour_id); TR/SB legs JOIN an existing tour_id (chosen in the
--     wizard, Block 2). Legs within a tour order by pickup date. It is a grouping key (a shared uuid),
--     NOT a FK to a separate tours table — no tours table is needed (and none exists to reuse).
--
-- Settlement linkage (NOTE ONLY — do NOT rebuild settlement logic here): the SB leg's arrival back in
-- Laredo is the trigger that closes the driver's settlement. The close itself stays in the EXISTING
-- driver-settlement module (settlements live in TMS, close on return to Laredo) — this migration only
-- adds the data the board reads; it wires no settlement behavior.
--
-- Reversible (manual down):
--   ALTER TABLE mdata.loads DROP COLUMN IF EXISTS tour_id;
--   ALTER TABLE mdata.loads DROP COLUMN IF EXISTS trip_type;
--   DROP TYPE IF EXISTS mdata.trip_type_enum;
-- Forward-only. Idempotent. mdata.loads already grants to ih35_app (0065) — new columns inherit.

BEGIN;

-- 1. Trip-type enum (idempotent create).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'trip_type_enum' AND n.nspname = 'mdata') THEN
    CREATE TYPE mdata.trip_type_enum AS ENUM ('NB', 'TR', 'SB');
  END IF;
END$$;

-- 2. Columns on loads — both nullable (existing rows keep NULL; create-time requirement is API-enforced).
ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS trip_type mdata.trip_type_enum;   -- NB | TR | SB

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS tour_id uuid;                     -- tour grouping key (NB starts; TR/SB join)

-- 3. Indexes for the board's grouping/aggregation, entity-scoped.
CREATE INDEX IF NOT EXISTS idx_loads_company_tour
  ON mdata.loads (operating_company_id, tour_id)
  WHERE tour_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loads_company_trip_type
  ON mdata.loads (operating_company_id, trip_type)
  WHERE trip_type IS NOT NULL;

COMMIT;
