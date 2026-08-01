-- RLS-BYPASS-SCHEMA-WIDE, wave 3 (final): the remaining 16 schemas
--
-- Drains the class. Same defect and same additive fix as 202611040000 (catalogs), 202611050000
-- (qbo_archive) and 202611060000 (accounting). Those three shipped one schema at a time to prove
-- the pattern on the highest-risk surfaces first; with the shape proven four times and the blast
-- radius established as read-only, the remaining schemas are batched into one reviewable migration
-- rather than 16 near-identical ones.
--
-- ROOT CAUSE (prod-verified 2026-08-01, br-fancy-credit-akjnd07a): 39 opco-scoped, RLS-enabled
-- tables across 16 schemas have no permissive policy granting the lucia bypass, so
-- `SET app.bypass_rls='lucia'` is INERT on them and every audit read returns 0 regardless of what
-- they hold. 742 rows are hidden today across 6 of those tables; the other 33 are empty, so the
-- value there is preventing the trap before data lands rather than uncovering data now.
--
-- Schemas in scope (explicit allowlist — the loop never discovers a schema on its own):
--   alerts, analytics, bank, brokerupdate, customer, driver_finance, driveralert, forecast,
--   geofence, maint, maintenance, mdata, qbo, safetydoc, tasks, utilization
--
-- The tables carrying data today:
--   qbo.sync_runs                      580 rows
--   maintenance.parts_inventory        144 rows
--   forecast.cash_entries                6 rows
--   maint.position_set                   6 rows
--   tasks.task                           5 rows
--   forecast.opening_balance             1 row
--
-- WORTH CALLING OUT — driver_finance.escrow_ledger / escrow_balances are in scope and are EMPTY
-- today (n_tup_ins = 0, never inserted). Driver escrow is an owner-locked money concept (escrow =
-- LIABILITY, held in trust) gated behind DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED. The moment that
-- flag flips and rows land, an audit read under a bypass context would silently return "no escrow"
-- — a false zero on a liability. Fixing an empty table costs nothing and removes that trap in
-- advance.
--
-- DELIBERATELY EXCLUDED — settlement.*: settlement.settlement, settlement.settlement_deduction and
-- settlement.settlement_line have the identical defect, but `settlement.*` is a RETIRE schema. The
-- canonical wiring map (docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md line 22) records
-- "RETIRE settlement.* -> driver_finance.*". Adding policies to a retired schema is work on a
-- surface nothing should build on, so those three are excluded here AND should be excluded from the
-- schema-wide invariant rather than remediated. Named so the exclusion is a recorded decision, not
-- an oversight.
--
-- Also excluded, verified individually rather than assumed: tables with no operating_company_id
-- column whose policies are already `USING (true)` (us_states, mexico_states, journal_entry_types)
-- — they read fine for everyone and a bypass branch there would be redundant.
--
-- FIX — additive, modifies NO existing policy. A separate SELECT-ONLY companion per affected table:
--
--     CREATE POLICY <table>_lucia_bypass ON <schema>.<table>
--       FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
--
-- Permissive policies OR together, so read visibility is restored while every existing policy —
-- name, command, predicate, WITH CHECK — is left completely untouched. Every affected policy is
-- FOR ALL, and a FOR ALL policy's USING governs which rows UPDATE/DELETE may TARGET; widening those
-- would be real write authority. A SELECT-only companion cannot.
--
-- SECURITY: FOR SELECT only; no WITH CHECK; no existing policy dropped, altered or re-emitted; no
-- predicate rewritten (so no ::text/::uuid semantics can shift); FORCE ROW LEVEL SECURITY status
-- unchanged; no data, column or grant change; no DELETE. identity.is_lucia_bypass() is STABLE and
-- returns a strict boolean, so it cannot widen anything through NULL propagation.
--
-- Table targeting is DYNAMIC within each allowlisted schema — the lesson from 202611040000, where
-- prod carried a policy the migration chain does not reproduce and a hardcoded prod-derived list
-- was therefore wrong on a fresh CI database. Re-runnable; a no-op on any table already covered.

BEGIN;

DO $$
DECLARE
  target_schemas text[] := ARRAY[
    'alerts','analytics','bank','brokerupdate','customer','driver_finance','driveralert',
    'forecast','geofence','maint','maintenance','mdata','qbo','safetydoc','tasks','utilization'
  ];
  s text;
  r record;
  policy_name text;
  fixed int := 0;
BEGIN
  FOREACH s IN ARRAY target_schemas LOOP
    IF to_regnamespace(s) IS NULL THEN
      RAISE NOTICE 'schema % absent - skipping (fresh-DB CI ordering)', s;
      CONTINUE;
    END IF;

    FOR r IN
      SELECT c.oid AS reloid, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = s
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = s
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

      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, s, r.relname);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO ih35_app USING (identity.is_lucia_bypass())',
        policy_name, s, r.relname
      );

      fixed := fixed + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'RLS-BYPASS remaining schemas: added SELECT-only lucia bypass companion to % table(s)', fixed;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (GUARD, on prod after the pipeline applies this):
--   BEGIN;
--     SELECT set_config('app.bypass_rls','lucia',true);
--     SELECT count(*) FROM qbo.sync_runs;                 -- expect 580, not 0
--     SELECT count(*) FROM maintenance.parts_inventory;   -- expect 144, not 0
--     SELECT count(*) FROM forecast.cash_entries;         -- expect   6, not 0
--   ROLLBACK;
--
--   -- and the class invariant, which this migration is intended to drive to zero:
--   -- 0 opco-scoped RLS tables in ANY schema (excluding the RETIRE settlement.*) lacking a
--   -- bypass-granting permissive policy.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   DROP POLICY IF EXISTS <table>_lucia_bypass ON <schema>.<table>; for each table this added one
--   to. No pre-existing policy was modified, so there is nothing else to restore.
