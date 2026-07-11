-- ITEM 2 (owner-approved 2026-07-11) — RE-ASSERT FORCED RLS on catalogs.excel_upload_jobs.
--
-- ROOT CAUSE (verified live on prod branch br-fancy-credit-akjnd07a, pg_catalog + both ledgers, 2026-07-11):
-- migration 0383_catalog_excel_upload_jobs.sql is recorded APPLIED in both prod ledgers
-- (_system._schema_migrations + ih35_migrations.applied_migrations), yet on prod the table shows
-- relrowsecurity=false, relforcerowsecurity=false, 0 policies. Its RLS block never took effect (ledger-vs-
-- reality drift — a past branch-promote/backfill marked migrations applied without running their bodies).
-- Because the ledger says 0383 is applied, db:migrate will NEVER re-run it, and editing 0383 is forbidden
-- (checksum freeze). A NEW idempotent migration is the only way to re-assert the access control.
--
-- This re-asserts 0383's EXACT intended contract (Owner/Administrator-only writes + lucia-bypass + grant),
-- idempotently (DROP POLICY IF EXISTS + ENABLE/FORCE are safe no-ops if already present). No data change.
-- Locked by scripts/verify-excel-upload-jobs-rls-forced.mjs (which pins 0383's contract). catalogs.* touch →
-- FINANCIAL-CLUSTER: owner approves the PR, then the runner (owner role) applies it on prod.
BEGIN;

-- Safe if the table is absent on a fresh CI DB (the generic-catalog framework migration runs first there,
-- but guard anyway so this is a clean no-op rather than an error if ordering differs).
DO $$
BEGIN
  IF to_regclass('catalogs.excel_upload_jobs') IS NULL THEN
    RAISE NOTICE 'reassert-excel-upload-jobs-rls: table absent, skipping';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE ON catalogs.excel_upload_jobs TO ih35_app;

  ALTER TABLE catalogs.excel_upload_jobs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.excel_upload_jobs FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS excel_upload_jobs_select_all ON catalogs.excel_upload_jobs;
  CREATE POLICY excel_upload_jobs_select_all ON catalogs.excel_upload_jobs
    FOR SELECT TO ih35_app USING (true);

  DROP POLICY IF EXISTS excel_upload_jobs_insert_admin ON catalogs.excel_upload_jobs;
  CREATE POLICY excel_upload_jobs_insert_admin ON catalogs.excel_upload_jobs
    FOR INSERT TO ih35_app
    WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

  DROP POLICY IF EXISTS excel_upload_jobs_update_admin ON catalogs.excel_upload_jobs;
  CREATE POLICY excel_upload_jobs_update_admin ON catalogs.excel_upload_jobs
    FOR UPDATE TO ih35_app
    USING (identity.current_user_role() IN ('Owner', 'Administrator'))
    WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

  DROP POLICY IF EXISTS excel_upload_jobs_lucia_bypass ON catalogs.excel_upload_jobs;
  CREATE POLICY excel_upload_jobs_lucia_bypass ON catalogs.excel_upload_jobs
    FOR ALL TO ih35_app
    USING (identity.is_lucia_bypass())
    WITH CHECK (identity.is_lucia_bypass());
END $$;

COMMIT;
