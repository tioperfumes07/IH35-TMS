-- RLS-BYPASS-SCHEMA-WIDE, wave 1 of N: qbo_archive
--
-- Same defect and same fix as 202611040000 (catalogs), applied to the schema with by far the
-- largest hidden-row exposure. Per-schema on purpose: one schema per migration keeps the blast
-- radius reviewable and lets each be reverted independently.
--
-- ROOT CAUSE (prod-verified 2026-08-01, br-fancy-credit-akjnd07a): five opco-scoped, RLS-enabled
-- qbo_archive tables have no permissive policy granting the lucia bypass, so
-- `SET app.bypass_rls='lucia'` is INERT on them and every audit read returns 0 regardless of
-- contents:
--
--   qbo_archive.forensic_anomalies       1,054,068 rows   qbo_forensic_anomalies_company_scope
--   qbo_archive.transactions_snapshot      710,297 rows   qbo_transactions_snapshot_company_scope
--   qbo_archive.entities_snapshot           62,856 rows   qbo_entities_snapshot_company_scope
--   qbo_archive.import_batches                 793 rows   qbo_import_batches_company_scope
--   qbo_archive.attachments_snapshot             0 rows   qbo_attachments_snapshot_company_scope
--                                        ---------
--                                        1,828,014 rows currently invisible to any bypass read
--
-- qbo_archive.import_batch_audit_log ALREADY carries the branch (rls_batch_audit_isolation) and is
-- untouched.
--
-- CONTEXT ON SEVERITY: this is ARCHIVE data — the QBO snapshot/forensic history — not the live
-- ledger. Nothing here posts. The harm is to AUDITABILITY: it is the largest single body of records
-- in the system that silently reads as empty, so any reconciliation or forensic question asked
-- against it gets a confident, wrong "no rows".
--
-- FIX — additive, and it modifies NO existing policy. For each affected table it adds a separate
-- SELECT-ONLY companion:
--
--     CREATE POLICY <table>_lucia_bypass ON qbo_archive.<table>
--       FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
--
-- PostgreSQL ORs permissive policies together, so read visibility is restored while every existing
-- policy — its name, command, predicate and WITH CHECK — is left completely untouched. All five
-- existing policies are FOR ALL, and a FOR ALL policy's USING governs which rows UPDATE/DELETE may
-- TARGET; widening those would be real write authority over 1.8M archive rows. A SELECT-only
-- companion cannot. This is the same shape already used in catalogs (202611040000) and by
-- equipment_types_lucia_bypass, dls_lucia_bypass and others.
--
-- SECURITY: FOR SELECT only; no WITH CHECK; no existing policy dropped or altered; no predicate
-- rewritten (so no ::text/::uuid semantics can shift); FORCE ROW LEVEL SECURITY status unchanged;
-- no data, column or grant change; no DELETE. identity.is_lucia_bypass() is STABLE and returns a
-- strict boolean, so it cannot widen anything through NULL propagation.
--
-- Targeting is DYNAMIC, not a hardcoded list: the DO block discovers, at apply time, every
-- opco-scoped RLS-enabled qbo_archive table with no bypass-granting permissive policy (in EITHER
-- spelling — identity.is_lucia_bypass() or the literal current_setting('app.bypass_rls')). A
-- hardcoded list harvested from prod is INVALID in a migration that must also run on a database
-- built only from the migration chain; that lesson came from 202611040000, where prod carried a
-- policy the chain does not reproduce and the CI db-state test caught it. Re-runnable; a no-op on
-- any table already covered.

BEGIN;

DO $$
DECLARE
  r record;
  policy_name text;
  fixed int := 0;
BEGIN
  IF to_regnamespace('qbo_archive') IS NULL THEN
    RAISE NOTICE 'schema qbo_archive absent - skipping (fresh-DB CI ordering)';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.oid AS reloid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'qbo_archive'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'qbo_archive'
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

    EXECUTE format('DROP POLICY IF EXISTS %I ON qbo_archive.%I', policy_name, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON qbo_archive.%I FOR SELECT TO ih35_app USING (identity.is_lucia_bypass())',
      policy_name, r.relname
    );

    fixed := fixed + 1;
  END LOOP;

  RAISE NOTICE 'RLS-BYPASS qbo_archive: added SELECT-only lucia bypass companion to % table(s)', fixed;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (GUARD, on prod after the pipeline applies this):
--   BEGIN;
--     SELECT set_config('app.bypass_rls','lucia',true);
--     SELECT count(*) FROM qbo_archive.forensic_anomalies;     -- expect 1,054,068, not 0
--     SELECT count(*) FROM qbo_archive.transactions_snapshot;  -- expect   710,297, not 0
--     SELECT count(*) FROM qbo_archive.entities_snapshot;      -- expect    62,856, not 0
--     SELECT count(*) FROM qbo_archive.import_batches;         -- expect       793, not 0
--   ROLLBACK;
--
--   -- entity-scoped reads must be UNAFFECTED, and the invariant must hold:
--   -- 0 opco-scoped RLS qbo_archive tables lacking a bypass-granting permissive policy.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   DROP POLICY IF EXISTS <table>_lucia_bypass ON qbo_archive.<table>; for each table this added one
--   to. No pre-existing policy was modified, so there is nothing else to restore.
