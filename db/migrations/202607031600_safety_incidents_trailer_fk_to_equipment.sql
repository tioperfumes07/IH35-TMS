-- SC-TRAILER-FK — repoint safety.incidents.trailer_id FK: mdata.units → mdata.equipment.
--
-- WHY (GUARD prod-verified 2026-07-03): trailers live in mdata.equipment (DryVan/Flatbed/
-- Reefer/StepDeck), NOT in mdata.units (trucks/tractors only — vehicle_type all null). 0345
-- created the FK inline as `trailer_id uuid REFERENCES mdata.units(id)`, which Postgres
-- auto-names `incidents_trailer_id_fkey`. Any real trailer id therefore 500s on FK violation,
-- so no damage report / cargo claim / trailer INTERCHANGE can persist its trailer. This repoints
-- the FK to the correct parent table.
--
-- DATA RISK: NONE. safety.incidents is empty on prod (0 rows, 0 with trailer_id) — verified by
-- the SC-CLUSTER GUARD. No backfill, no orphan risk. This is a normal additive migration that
-- SHOULD deploy on merge (db:migrate); it is NOT a held / DO-NOT-RUN-ON-PROD migration. The
-- HOLD-FOR-JORGE label governs the MERGE decision (never self-merge a migration — CLAUDE.md §2),
-- not a separate Neon-only apply.
--
-- IDEMPOTENT + drift-capture. VALIDATE is instant on the empty table. ON DELETE SET NULL keeps
-- void-not-delete consistency: deleting a trailer nulls the reference rather than cascading.
--
-- RLS/GRANTS: UNCHANGED by an FK swap. Policy `safety_incidents_tenant_scope` (0345, FOR ALL,
-- keyed on the row's own operating_company_id) and `GRANT SELECT,INSERT,UPDATE ... TO ih35_app`
-- are untouched — a foreign-key constraint is column-agnostic and does not alter row policies or
-- table privileges. The FK to mdata.equipment does NOT grant cross-entity read; same-entity
-- trailer visibility is enforced in the backend (RLS-scoped existence check → 400 invalid_trailer),
-- never relied upon via the FK for tenant isolation.

BEGIN;

-- 1) Drop the wrong FK (→ mdata.units). IF EXISTS: no-op on a fresh CI DB where 0345 may not yet
--    have created it, or on a partial re-run.
ALTER TABLE safety.incidents
  DROP CONSTRAINT IF EXISTS incidents_trailer_id_fkey;

-- 2) Add the correct FK (→ mdata.equipment). Guarded so a re-run after a full apply is a no-op.
--    NOT VALID first (cheap), then VALIDATE (instant on an empty table).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'safety'
      AND t.relname = 'incidents'
      AND c.conname = 'incidents_trailer_id_fkey'
  ) THEN
    ALTER TABLE safety.incidents
      ADD CONSTRAINT incidents_trailer_id_fkey
      FOREIGN KEY (trailer_id) REFERENCES mdata.equipment(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END
$$;

ALTER TABLE safety.incidents
  VALIDATE CONSTRAINT incidents_trailer_id_fkey;

COMMENT ON COLUMN safety.incidents.trailer_id IS
  'Trailer involved — references mdata.equipment (trailers); mdata.units is trucks only. Repointed 2026-07 (was mdata.units).';

-- Drift-capture: confirm the FK now targets mdata.equipment (no-op assertion; aids CI/forensics).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t   ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class ft  ON ft.oid = c.confrelid
    JOIN pg_namespace fn ON fn.oid = ft.relnamespace
    WHERE n.nspname = 'safety'
      AND t.relname = 'incidents'
      AND c.conname = 'incidents_trailer_id_fkey'
      AND fn.nspname = 'mdata'
      AND ft.relname = 'equipment'
  ) THEN
    RAISE EXCEPTION 'SC-TRAILER-FK drift: incidents_trailer_id_fkey does not reference mdata.equipment';
  END IF;
END
$$;

COMMIT;

-- DOWN (manual rollback):
-- ALTER TABLE safety.incidents DROP CONSTRAINT IF EXISTS incidents_trailer_id_fkey;
-- ALTER TABLE safety.incidents
--   ADD CONSTRAINT incidents_trailer_id_fkey
--   FOREIGN KEY (trailer_id) REFERENCES mdata.units(id);
