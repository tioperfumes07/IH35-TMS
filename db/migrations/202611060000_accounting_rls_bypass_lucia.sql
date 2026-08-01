-- RLS-BYPASS-SCHEMA-WIDE, wave 2: accounting
--
-- Same defect and same additive fix as 202611040000 (catalogs) and 202611050000 (qbo_archive),
-- applied per-schema so each wave stays independently reviewable and revertible.
--
-- ROOT CAUSE (prod-verified 2026-08-01, br-fancy-credit-akjnd07a): six opco-scoped, RLS-enabled
-- accounting tables have no permissive policy granting the lucia bypass, so
-- `SET app.bypass_rls='lucia'` is INERT on them and every audit read returns 0 regardless of what
-- they hold:
--
--   accounting.outbox_events                170 rows
--   accounting.vendor_credits                 6 rows
--   accounting.period_cash_basis_snapshot     0 rows
--   accounting.vendor_credit_applications     0 rows
--   accounting.cash_flow_adjustments          0 rows
--   accounting.cash_forecast_settings         0 rows
--
-- WHY THIS SCHEMA MATTERS MORE THAN ITS ROW COUNT: these are small today but they are the AUDIT
-- surfaces of the money core. accounting.vendor_credits / vendor_credit_applications are the
-- subledger evidence a bill's reverse drill-through exposes (Law §9); period_cash_basis_snapshot is
-- the read-only closed-period cash-basis record that Block-20.3 locks; outbox_events is the
-- delivery trail. A reviewer asking "were any vendor credits applied to this bill?" under a bypass
-- context currently gets a confident, wrong "none" — and 0 rows is exactly the answer that looks
-- like a clean result rather than a broken read.
--
-- NOTE ON WHAT IS *NOT* HERE: the posting core — journal_entries, invoices, bills, payments,
-- bill_payments — already carries the bypass and is untouched. This wave adds no visibility to any
-- table that posts.
--
-- FIX — additive, modifies NO existing policy. A separate SELECT-ONLY companion per affected table:
--
--     CREATE POLICY <table>_lucia_bypass ON accounting.<table>
--       FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
--
-- Permissive policies OR together, so read visibility is restored while every existing policy —
-- name, command, predicate, WITH CHECK — is left completely untouched. All six existing policies
-- are FOR ALL, and a FOR ALL policy's USING governs which rows UPDATE/DELETE may TARGET; widening
-- those on accounting tables would be real write authority over money-adjacent records. A
-- SELECT-only companion cannot.
--
-- SECURITY: FOR SELECT only; no WITH CHECK; no existing policy dropped, altered or re-emitted; no
-- predicate rewritten (so no ::text/::uuid semantics can shift); FORCE ROW LEVEL SECURITY status
-- unchanged; no data, column or grant change; no DELETE. identity.is_lucia_bypass() is STABLE and
-- returns a strict boolean, so it cannot widen anything through NULL propagation.
--
-- Targeting is DYNAMIC, not a hardcoded list — the lesson from 202611040000, where prod carried a
-- policy the migration chain does not reproduce and a hardcoded prod-derived list was therefore
-- wrong on a fresh CI database. Re-runnable; a no-op on any table already covered.

BEGIN;

DO $$
DECLARE
  r record;
  policy_name text;
  fixed int := 0;
BEGIN
  IF to_regnamespace('accounting') IS NULL THEN
    RAISE NOTICE 'schema accounting absent - skipping (fresh-DB CI ordering)';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.oid AS reloid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'accounting'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'accounting'
          AND col.table_name = c.relname
          AND col.column_name = 'operating_company_id'
      )
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

    EXECUTE format('DROP POLICY IF EXISTS %I ON accounting.%I', policy_name, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON accounting.%I FOR SELECT TO ih35_app USING (identity.is_lucia_bypass())',
      policy_name, r.relname
    );

    fixed := fixed + 1;
  END LOOP;

  RAISE NOTICE 'RLS-BYPASS accounting: added SELECT-only lucia bypass companion to % table(s)', fixed;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (GUARD, on prod after the pipeline applies this):
--   BEGIN;
--     SELECT set_config('app.bypass_rls','lucia',true);
--     SELECT count(*) FROM accounting.outbox_events;   -- expect 170, not 0
--     SELECT count(*) FROM accounting.vendor_credits;  -- expect   6, not 0
--   ROLLBACK;
--
--   -- and the invariant: 0 opco-scoped RLS accounting tables lacking a bypass-granting permissive
--   -- policy. The db-state guard asserts exactly this once 'accounting' joins REMEDIATED_SCHEMAS.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   DROP POLICY IF EXISTS <table>_lucia_bypass ON accounting.<table>; for each table this added one
--   to. No pre-existing policy was modified, so there is nothing else to restore.
