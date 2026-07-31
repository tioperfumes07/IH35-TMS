-- CAT-RLS-BYPASS-01 — restore lucia GUC-bypass READ visibility across catalogs.*
--
-- ROOT CAUSE (prod-verified 2026-07-31, br-fancy-credit-akjnd07a): opco-scoped, RLS-enabled
-- catalogs.* tables whose permissive policies check ONLY app.operating_company_id make
-- `SET app.bypass_rls='lucia'` INERT. Such a table returns 0 rows no matter what it contains. That
-- is not a masked read — it is a real gap in the policy text, and it silently corrupts every audit
-- that follows the repo's own documented technique.
--
-- HOW IT SURFACED: the WAVE-H1 audit recorded all seven of its target catalogs as "Row count 0"
-- using the CORRECT bypass technique and specced a seed migration on that premise. Four were in
-- fact populated — proven RLS-immune via pg_stat_user_tables with n_tup_del = 0 (rows live, not
-- deleted): driver_deduction_types 21, expense_categories 9, chart_of_accounts_seeds 9,
-- escrow_types 3; cash_advance_types genuinely 0. Seeding on that false premise would have
-- duplicated live catalog data, including driver_deduction_types, whose owner-locked DRV-02 codes
-- are the FK target of driver_finance.escrow_deductions_pending.source_type by (opco, code).
--
-- ============================ WHY THIS IS ADDITIVE, NOT A REWRITE ============================
-- An earlier draft hardcoded 61 table names harvested from PROD and rewrote each company_scope
-- policy with DROP + CREATE. That was wrong twice over, and both failures were caught before merge:
--
--   1. A PROD-DERIVED LIST IS INVALID IN A MIGRATION. Migrations also run against a database built
--      only from the migration chain (fresh CI). Prod has drifted: catalogs.form_425c_company_profiles
--      carries policy `form_425c_company_profiles_tenant_scope_usmca1` WITH the bypass on prod
--      (6/6 rows visible), but that policy does not exist on a migration-built database, where the
--      table is genuinely bypass-less. A fixed list cannot be correct on both. The CI db-test caught
--      exactly this.
--   2. REWRITING A POLICY DESTROYS ITS PREDICATE. The affected policies are NOT uniform: some
--      compare (operating_company_id)::text, others operating_company_id::uuid; catalogs.detail_types
--      carries a shared-canonical `operating_company_id IS NULL OR ...`; policy NAMES vary
--      (company_scope, rls_leave_policies_isolation, form_425c_company_profiles_tenant_scope_usmca1).
--      Re-emitting them in one uniform shape would silently change comparison semantics — invisible
--      in review, and precisely the class of change this repo forbids.
--
-- THEREFORE this migration MODIFIES NO EXISTING POLICY. It ADDS a separate, additive,
-- SELECT-ONLY companion policy per affected table:
--
--     CREATE POLICY <table>_lucia_bypass ON catalogs.<table>
--       FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
--
-- PostgreSQL ORs permissive policies together, so this grants read visibility under bypass while
-- every existing policy — its name, its command, its predicate, its WITH CHECK — is left completely
-- untouched. This is already the established shape in this schema (equipment_types_lucia_bypass,
-- dls_lucia_bypass, cr_lucia_bypass, excel_upload_jobs_lucia_bypass).
--
-- SECURITY — strictly narrower than modifying the existing policy:
--   * FOR SELECT ONLY. It cannot widen INSERT/UPDATE/DELETE. A FOR ALL policy's USING governs which
--     rows UPDATE/DELETE may TARGET, so widening that would have been real write authority; adding a
--     SELECT-only companion cannot. This is the per-table SELECT-only treatment applied uniformly.
--   * No WITH CHECK on the new policy (a SELECT policy cannot carry one), so no write path changes.
--   * No existing policy is dropped, altered, or re-emitted. No predicate is rewritten, so no
--     ::text/::uuid semantics change is possible.
--   * identity.is_lucia_bypass() is STABLE and returns a strict boolean (never NULL), so it cannot
--     widen anything through NULL propagation.
--   * FORCE ROW LEVEL SECURITY status is UNCHANGED. No data, column, or grant change. No DELETE.
--
-- TARGETING IS DYNAMIC, not a hardcoded list: the DO block discovers, at apply time, every
-- opco-scoped RLS-enabled catalogs table that has no permissive policy already granting the bypass
-- (in EITHER spelling — identity.is_lucia_bypass() or the literal current_setting('app.bypass_rls')).
-- It therefore converges to the same correct end-state on prod and on a fresh CI database, and is
-- a no-op on any table already covered. Re-runnable.
--
-- NOT INCLUDED, verified individually rather than assumed:
--   * us_states, mexico_states, journal_entry_types — RLS-enabled but no operating_company_id
--     column and policies already `USING (true)`; they read fine for everyone.
--   * leave_policies / driver_leave_balances — already carry the bypass in the LITERAL
--     current_setting('app.bypass_rls')='lucia' spelling. Live-proven: leave_policies returns 3 of 3
--     rows under bypass (driver_leave_balances is genuinely empty, 0 of 0). A pattern matching only
--     '%is_lucia_bypass%' reports these as broken; they are not, and rewriting them would have
--     converted their ::uuid comparison to ::text.
--   * catalogs.detail_types — all 144 rows have operating_company_id IS NULL and its SELECT policy
--     is `opco IS NULL OR opco = GUC`, so every row is already readable with no GUC. It is not
--     false-zero. The dynamic query still covers it additively if it ever lacks an escape.

BEGIN;

DO $$
DECLARE
  r record;
  policy_name text;
  fixed int := 0;
BEGIN
  FOR r IN
    SELECT c.oid AS reloid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalogs'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'catalogs'
          AND col.table_name = c.relname
          AND col.column_name = 'operating_company_id'
      )
      -- no permissive policy already grants the bypass, in EITHER accepted spelling
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = c.oid
          AND p.polpermissive
          AND p.polqual IS NOT NULL
          AND (
            pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_lucia_bypass%'
            OR pg_get_expr(p.polqual, p.polrelid) ILIKE '%bypass_rls%'
          )
      )
    ORDER BY c.relname
  LOOP
    policy_name := left(r.relname || '_lucia_bypass', 63);

    EXECUTE format('DROP POLICY IF EXISTS %I ON catalogs.%I', policy_name, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON catalogs.%I FOR SELECT TO ih35_app USING (identity.is_lucia_bypass())',
      policy_name, r.relname
    );

    fixed := fixed + 1;
  END LOOP;

  RAISE NOTICE 'CAT-RLS-BYPASS-01: added SELECT-only lucia bypass companion policy to % catalogs table(s)', fixed;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (GUARD, on prod after the pipeline applies this):
--   BEGIN;
--     SELECT set_config('app.bypass_rls','lucia',true);
--     SELECT count(*) FROM catalogs.driver_deduction_types;   -- expect 21, not 0
--     SELECT count(*) FROM catalogs.expense_categories;       -- expect 9,  not 0
--     SELECT count(*) FROM catalogs.chart_of_accounts_seeds;  -- expect 9,  not 0
--     SELECT count(*) FROM catalogs.escrow_types;             -- expect 3,  not 0
--     SELECT count(*) FROM catalogs.cash_advance_types;       -- expect 0   (truly empty)
--   ROLLBACK;
--
--   -- entity-scoped reads UNAFFECTED (TRANSP still sees only its own rows):
--   BEGIN;
--     SELECT set_config('app.operating_company_id','<TRANSP uuid>',true);
--     SELECT count(*) FROM catalogs.driver_deduction_types;   -- expect 7
--   ROLLBACK;
--
--   -- and the invariant: ZERO opco-scoped RLS catalogs tables lacking a bypass-granting permissive
--   -- policy. The db-state guard asserts exactly this on the fresh CI database.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   DROP POLICY IF EXISTS <table>_lucia_bypass ON catalogs.<table>; for each table this added one to.
--   No pre-existing policy was modified, so there is nothing else to restore.
