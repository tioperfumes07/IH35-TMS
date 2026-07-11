-- CEREMONY FINAL STEP (ITEM 13, owner-approved 2026-07-11) — VALIDATE the 8 NOT-VALID ceremony FKs.
--
-- Context: the 8 cross-module FK migrations' SCHEMA is already applied on prod (columns + FK constraints
-- exist), but 8 constraints remain convalidated=false (created NOT VALID). GUARD proved 0 orphans on a
-- branch forked from prod (br-nameless-bread-ak999ufm), so VALIDATE will be clean. VALIDATE is
-- non-destructive + RLS-immune (full physical scan): it either succeeds or errors NAMING the violating
-- row and leaves the constraint NOT VALID — it never deletes or changes data.
--
-- Why the guards below: the 8 underlying FK migrations are HELD (skipped by db:migrate; applied on prod by
-- hand + ledger-backfilled), so on a FRESH CI DB (build-typecheck runs db:migrate from 0001) these tables/
-- constraints DO NOT EXIST. Each VALIDATE is wrapped so it runs ONLY when the constraint exists AND is not
-- already valid — making this migration a safe no-op on CI and idempotent on prod (re-running is harmless).
-- VALIDATE requires the table owner (neondb_owner); the migration runner connects with owner privileges.
BEGIN;

DO $$
DECLARE
  rec RECORD;
  targets CONSTANT text[][] := ARRAY[
    ['dispatch.detention_requests', 'detention_requests_invoice_id_fkey'],
    ['dispatch.detention_requests', 'detention_requests_invoice_line_id_fkey'],
    ['maintenance.work_orders',     'work_orders_unit_id_fkey'],
    ['maintenance.work_orders',     'work_orders_driver_id_fkey'],
    ['safety.accident_reports',     'fk_accident_reports_load'],
    ['safety.accident_reports',     'fk_accident_reports_unit'],
    ['safety.accident_reports',     'fk_accident_reports_vendor'],
    ['safety.incidents',            'incidents_auto_created_claim_id_fkey']
  ];
  i int;
  tbl text;
  con text;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    tbl := targets[i][1];
    con := targets[i][2];
    -- Skip if the table is absent (fresh CI DB where the held FK migrations did not run).
    IF to_regclass(tbl) IS NULL THEN
      RAISE NOTICE 'validate-ceremony-fks: table % absent, skipping %', tbl, con;
      CONTINUE;
    END IF;
    -- Only VALIDATE when the constraint exists AND is still NOT VALID (idempotent no-op otherwise).
    SELECT 1 INTO rec
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass(tbl)
      AND c.conname = con
      AND c.convalidated = false;
    IF FOUND THEN
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', tbl, con);
      RAISE NOTICE 'validate-ceremony-fks: VALIDATED % on %', con, tbl;
    ELSE
      RAISE NOTICE 'validate-ceremony-fks: % on % not present/NOT-VALID, skipping', con, tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;
