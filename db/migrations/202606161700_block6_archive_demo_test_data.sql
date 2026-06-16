-- Block 6 — GO-LIVE demo/test data purge (SOFT-ARCHIVE, never delete; reversible; ledger-backed).
--
-- Scope LOCKED by Jorge 2026-06-16 after GUARD prod pre-check (the mandatory eyeball that caught
-- "3 Rivers Logistics" as a REAL customer — it is NOT touched here):
--   * mdata.drivers  — the 4 literal "Demo" drivers (Juan/Maria/Carlos/Ana Demo) -> archived_at.
--                      The other 77 drivers are REAL and untouched.
--   * mdata.loads    — all DEMO-L% loads (the whole loads table is demo today, expected 5) -> soft_deleted_at.
--   * mdata.units    — the TEST-TRUCK-% test units (expected 4: TEST-TRUCK-1/2/3/4) -> deactivated_at.
--   * mdata.customers — NONE. 3 Rivers + all real customers stay.
--
-- mdata.equipment (SAM-* phantom), mdata.vendors (TEST-/seed-), maintenance.work_orders (demo-linked)
-- are intentionally NOT included here — GUARD confirms their real DB counts first; a follow-up adds
-- them only if confirmed demo. See docs/specs/BLOCK-6-DEMO-PURGE-PLAN.md.
--
-- Pattern mirrors migration 0320 (archived_at + ledger). Idempotent: only archives rows whose
-- soft-delete column IS NULL, so re-runs are no-ops. Reverse via the ledger:
--   UPDATE <schema>.<table> SET <soft_delete_column> = NULL WHERE id IN (
--     SELECT row_id FROM migration.block6_demo_purge_ledger WHERE table_name = '<table>');

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.block6_demo_purge_ledger (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  soft_delete_column text NOT NULL,
  archived_at timestamptz NOT NULL,
  migration_ts timestamptz NOT NULL,
  PRIMARY KEY (table_schema, table_name, row_id)
);

DO $$
DECLARE
  v_ts timestamptz := clock_timestamp();
  v_drivers int := 0;
  v_loads int := 0;
  v_units int := 0;
BEGIN
  -- 1) DRIVERS — the 4 literal "Demo" drivers. Jorge confirmed the other 77 are real (no "Demo" token).
  WITH arch AS (
    UPDATE mdata.drivers d
       SET archived_at = v_ts, updated_at = now()
     WHERE d.archived_at IS NULL
       AND (d.first_name ILIKE '%Demo%' OR d.last_name ILIKE '%Demo%')
    RETURNING d.id
  )
  INSERT INTO migration.block6_demo_purge_ledger
    (table_schema, table_name, row_id, soft_delete_column, archived_at, migration_ts)
  SELECT 'mdata', 'drivers', id, 'archived_at', v_ts, v_ts FROM arch
  ON CONFLICT (table_schema, table_name, row_id) DO NOTHING;
  GET DIAGNOSTICS v_drivers = ROW_COUNT;
  RAISE NOTICE 'block6: archived % demo driver(s) [expected 4: Juan/Maria/Carlos/Ana Demo]', v_drivers;

  -- 2) LOADS — all DEMO-L% loads (whole table is demo today; expected 5: DEMO-L001..L005).
  WITH arch AS (
    UPDATE mdata.loads l
       SET soft_deleted_at = v_ts, updated_at = now()
     WHERE l.soft_deleted_at IS NULL
       AND l.load_number ILIKE 'DEMO-L%'
    RETURNING l.id
  )
  INSERT INTO migration.block6_demo_purge_ledger
    (table_schema, table_name, row_id, soft_delete_column, archived_at, migration_ts)
  SELECT 'mdata', 'loads', id, 'soft_deleted_at', v_ts, v_ts FROM arch
  ON CONFLICT (table_schema, table_name, row_id) DO NOTHING;
  GET DIAGNOSTICS v_loads = ROW_COUNT;
  RAISE NOTICE 'block6: archived % demo load(s) [expected 5: DEMO-L001..L005]', v_loads;

  -- 3) UNITS — the TEST-TRUCK-% test units (expected 4: TEST-TRUCK-1/2/3/4).
  WITH arch AS (
    UPDATE mdata.units u
       SET deactivated_at = v_ts, updated_at = now()
     WHERE u.deactivated_at IS NULL
       AND u.unit_number ILIKE 'TEST-%'
    RETURNING u.id
  )
  INSERT INTO migration.block6_demo_purge_ledger
    (table_schema, table_name, row_id, soft_delete_column, archived_at, migration_ts)
  SELECT 'mdata', 'units', id, 'deactivated_at', v_ts, v_ts FROM arch
  ON CONFLICT (table_schema, table_name, row_id) DO NOTHING;
  GET DIAGNOSTICS v_units = ROW_COUNT;
  RAISE NOTICE 'block6: archived % test unit(s) [expected 4: TEST-TRUCK-1/2/3/4]', v_units;

  RAISE NOTICE 'block6 TOTAL archived: % driver(s), % load(s), % unit(s). 3 Rivers + all customers + the 77 real drivers UNTOUCHED.',
    v_drivers, v_loads, v_units;
END $$;
