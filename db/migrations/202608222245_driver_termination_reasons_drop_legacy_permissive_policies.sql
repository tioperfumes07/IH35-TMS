-- 202608222245_driver_termination_reasons_drop_legacy_permissive_policies.sql
--
-- APPLIED TO PROD 2026-08-22 (Neon tiny-field-89581227, br-fancy-credit-akjnd07a) via a
-- prepare_database_migration/complete_database_migration round-trip verified on a disposable temp
-- branch first (policies=company_scope, USMCA cnt=18/TRK cnt=16/TRANSP cnt=16, matching prod's
-- true per-company counts) before landing on the default branch. This file is the durable, ledgered
-- record of that live DDL for fresh-DB CI migrate + audit trail; it is idempotent and safe to run
-- again on a DB that has never seen it.
--
-- CC3-TERMREASON-LEAK-20260822 — catalogs.driver_termination_reasons is per-entity (migration
-- 202607890000_driver_termination_reasons_per_entity.sql added a `company_scope` PERMISSIVE policy
-- gating every command on `operating_company_id = current_setting('app.operating_company_id')`), but
-- that migration never dropped the two PERMISSIVE policies from the table's original GLOBAL-catalog
-- era (0023_driver_safety_file.sql):
--
--   dtr_select_authenticated  FOR SELECT TO ih35_app USING (true)
--   dtr_modify_owner_only     FOR ALL    TO ih35_app USING (role = 'Owner' OR is_lucia_bypass())
--
-- Postgres combines multiple PERMISSIVE policies for the same command with OR, never AND. So the
-- live effective predicate for SELECT is `company_scope.using OR dtr_select_authenticated.using`
-- = `(... ) OR true` = always true, and for INSERT/UPDATE/DELETE it is `company_scope.using OR
-- dtr_modify_owner_only.using` = allowed whenever the caller is Owner-role, REGARDLESS of which
-- company's row is being touched. The entity-scope conversion has been a structural no-op since the
-- day it landed.
--
-- LIVE PROOF (2026-08-22, Neon `tiny-field-89581227`, ih35_app role, GUC pinned to USMCA
-- 5c854333-6ea5-4faa-af31-67cb272fef80):
--   SELECT set_config('app.operating_company_id','5c854333-...',false), (SELECT count(*) FROM
--   catalogs.driver_termination_reasons) -> cnt = 50 (TRANSP 16 + TRK 16 + USMCA 18), not USMCA's
--   own 18. Confirmed live in the Owner UI: /lists/drivers/termination-reasons showed "Total rows:
--   50" with every code tripled (one row per company), commingled with no company indicator.
--
-- FIX: drop both legacy policies. Application-layer `isOwner(authUser.role)` gating already covers
-- the write-role check on every mutation route (driver-safety-events.routes.ts POST/PATCH/deactivate/
-- reactivate all call `isOwner`/`ensureAdmin` before touching the DB), so `dtr_modify_owner_only` was
-- pure redundancy even before it became a leak vector. `company_scope` alone — already used by every
-- other per-entity catalog in this repo — is the correct and sufficient policy for all four commands.
--
-- IDEMPOTENT: DROP POLICY IF EXISTS; safe to apply twice and on the fresh-DB CI migrate from 0001
-- (0023 creates the two legacy policies unconditionally on table create; this migration always runs
-- after both 0023 and 202607890000 in migration order).

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'driver_termination_reasons'
             AND relnamespace = 'catalogs'::regnamespace) THEN
    DROP POLICY IF EXISTS dtr_select_authenticated ON catalogs.driver_termination_reasons;
    DROP POLICY IF EXISTS dtr_modify_owner_only ON catalogs.driver_termination_reasons;
  END IF;
END
$mig$;
