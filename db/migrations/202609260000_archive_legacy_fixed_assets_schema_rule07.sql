-- [HOLD-FOR-JORGE — FINANCIAL-ADJACENT SCHEMA] Rule 07 — ARCHIVE legacy fixed_assets.* (FH-1 orphan)
-- Canonical asset register + depreciation: accounting.fixed_assets (+ related accounting.* surfaces).
-- Legacy schema created by 202606151600_fh1_fixed_assets_data_model.sql — never became the live path;
-- prod truth: to_regclass('fixed_assets.assets') EXISTS (read-only archive after apply).
--
-- *** DO NOT RUN ON PROD VIA db:migrate. Apply ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill db/migrations/.held-migrations.json (held -> applied_held). ***
--
-- Rule 07 (never delete, only add): COMMENT-mark DEPRECATED/ARCHIVED — no DROP, no DELETE, no TRUNCATE.
-- Defense-in-depth: REVOKE INSERT/UPDATE (and DELETE if ever granted) from ih35_app on legacy tables;
-- SELECT remains for audit/historical reads.
--
-- Idempotent + fresh-DB-safe: each block guarded with IF EXISTS (SELECT 1 WHERE to_regclass(...) IS NOT NULL).

BEGIN;

DO $archive$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'fixed_assets') THEN
    COMMENT ON SCHEMA fixed_assets IS
      'ARCHIVED (Rule 07, 2026-07-27) — superseded by accounting.fixed_assets. Legacy FH-1 fixed_assets.* schema; read-only archive. Do not write.';
  END IF;
END
$archive$;

-- Per-table archive comments + write lock (ih35_app)
DO $archive$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'fixed_assets.asset_classes',
    'fixed_assets.assets',
    'fixed_assets.depreciation_schedules',
    'fixed_assets.disposals'
  ]
  LOOP
    IF EXISTS (SELECT 1 WHERE to_regclass(tbl) IS NOT NULL) THEN
      EXECUTE format(
        'COMMENT ON TABLE %s IS %L',
        tbl,
        'ARCHIVED (Rule 07, 2026-07-27) — superseded by accounting.fixed_assets. Legacy FH-1 row store; read-only. Writes must target accounting.fixed_assets.'
      );
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE %s FROM ih35_app', tbl);
      EXECUTE format('GRANT SELECT ON TABLE %s TO ih35_app', tbl);
    END IF;
  END LOOP;
END
$archive$;

COMMIT;

-- POST-APPLY VERIFICATION (Neon branch, Jorge hand):
--   SELECT obj_description('fixed_assets'::regnamespace, 'pg_namespace');
--   SELECT relname, obj_description(oid) FROM pg_class WHERE relnamespace = 'fixed_assets'::regnamespace AND relkind = 'r';
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'fixed_assets' AND grantee = 'ih35_app';
