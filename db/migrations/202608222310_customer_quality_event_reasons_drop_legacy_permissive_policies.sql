-- 202608222310_customer_quality_event_reasons_drop_legacy_permissive_policies.sql
--
-- CC3-TERMREASON-LEAK-20260822 sibling — found via a source-level sweep for the same bug shape
-- immediately after fixing catalogs.driver_termination_reasons (202608222245): grepped
-- db/migrations/*.sql for the GLOBAL-catalog-era policy naming convention
-- (`_select_authenticated` / `_modify_owner_only` / `_select_owner_admin`) and cross-checked each
-- hit against whether a LATER per-entity-conversion migration added `company_scope` on the same
-- table without dropping the earlier ones. Four source migrations use that naming convention:
--   0023 driver_safety_file.sql        -> driver_termination_reasons   FIXED (this session, 202608222245)
--   0025 dispatcher_safety_file.sql    -> dispatcher_error_reasons     ALREADY FIXED (202608010000 drops both before creating company_scope)
--   0026 customer_quality_flags.sql    -> customer_quality_event_reasons  STILL BROKEN -- this migration
--   0028 docs_schema.sql               -> catalogs.file_categories     NOT a bug -- genuinely global, never converted to per-entity
--
-- catalogs.customer_quality_event_reasons was converted to per-entity by
-- 202607920000_customer_quality_reasons_per_entity.sql, which added a correct `company_scope`
-- PERMISSIVE policy but never dropped the table's two PERMISSIVE policies from its GLOBAL-catalog
-- era (0026_customer_quality_flags.sql): cqer_select_authenticated (FOR SELECT USING true) and
-- cqer_modify_owner_only (FOR ALL USING role='Owner', no company check). Same OR-defeat as the
-- termination-reasons bug: SELECT was effectively unscoped, writes allowed any Owner-role caller
-- to touch another company's rows.
--
-- LIVE PROOF (2026-08-22, Neon tiny-field-89581227): pg_policy on
-- catalogs.customer_quality_event_reasons showed 3 PERMISSIVE policies pre-fix (company_scope,
-- cqer_modify_owner_only, cqer_select_authenticated USING true) -- identical shape to the already-
-- confirmed termination-reasons leak.
--
-- FIX: drop both legacy policies. company_scope alone is correct and sufficient (same reasoning as
-- the termination-reasons fix: app-layer role gating already exists where needed on this catalog's
-- write routes).
--
-- IDEMPOTENT: DROP POLICY IF EXISTS; safe to apply twice and on the fresh-DB CI migrate from 0001.

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'customer_quality_event_reasons'
             AND relnamespace = 'catalogs'::regnamespace) THEN
    DROP POLICY IF EXISTS cqer_select_authenticated ON catalogs.customer_quality_event_reasons;
    DROP POLICY IF EXISTS cqer_modify_owner_only ON catalogs.customer_quality_event_reasons;
  END IF;
END
$mig$;
