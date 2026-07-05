-- INV-1 — make the inventory part create FUNCTIONAL (non-financial maintenance/inventory tooling).
--
-- Bug being fixed (build-and-HOLD, migration → Jorge reviews SQL):
--   maintenance.parts_inventory had NO sku/part_number, NO category, NO notes columns. The create
--   route (POST /api/v1/maintenance/parts) therefore:
--     • returned  id::text  as the "part_number"/SKU  → a FAKE, opaque UUID SKU shown in the UI, and
--     • silently DROPPED the category + notes the create drawer collects (Zod stripped them; they were
--       never persisted).
--   This adds the three missing, PERSISTED columns so a real SKU is stored/displayed and category+notes
--   round-trip. ADDITIVE ONLY — nothing renamed, moved, or dropped.
--
-- Idempotent + guarded: ADD COLUMN IF NOT EXISTS behind a to_regclass table guard (fresh CI DBs build
-- maintenance.parts_inventory in 0049, so the table is present; the guard keeps this safe regardless).
-- part_number is a plain text column (user-entered SKU; the app generates a stable "PART-XXXXXXXX" SKU
-- when the user leaves it blank). A one-time backfill gives every pre-existing row a stable SKU derived
-- deterministically from its own id, so the UI stops showing raw UUIDs. Re-running the backfill is a
-- no-op (only touches NULL/empty part_number).
--
-- Grants: maintenance.parts_inventory already has table-level SELECT/INSERT/UPDATE for ih35_app (0049);
-- new columns inherit table-level privileges in Postgres, so no new column grants are required. A
-- defensive, idempotent table GRANT is included so a fresh role can never 500 on the new columns.

BEGIN;

DO $$
BEGIN
  IF to_regclass('maintenance.parts_inventory') IS NOT NULL THEN
    ALTER TABLE maintenance.parts_inventory ADD COLUMN IF NOT EXISTS part_number text;
    ALTER TABLE maintenance.parts_inventory ADD COLUMN IF NOT EXISTS category    text;
    ALTER TABLE maintenance.parts_inventory ADD COLUMN IF NOT EXISTS notes       text;
  END IF;
END
$$;

-- Backfill a stable, human-readable SKU for legacy rows that have none. Deterministic from the row id,
-- so it is stable across re-runs and identical to the fallback the app/SELECT use.
DO $$
BEGIN
  IF to_regclass('maintenance.parts_inventory') IS NOT NULL THEN
    UPDATE maintenance.parts_inventory
       SET part_number = 'PART-' || upper(substr(replace(id::text, '-', ''), 1, 8))
     WHERE part_number IS NULL
        OR btrim(part_number) = '';
  END IF;
END
$$;

-- Search/lookup support for the new SKU (scoped by operating company like the RLS predicate).
CREATE INDEX IF NOT EXISTS parts_inventory_part_number_idx
  ON maintenance.parts_inventory (operating_company_id, part_number);

-- Defensive, idempotent grant (columns inherit table grants; this just guarantees it).
GRANT SELECT, INSERT, UPDATE ON maintenance.parts_inventory TO ih35_app;

COMMIT;
