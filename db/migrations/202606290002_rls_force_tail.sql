-- ============================================================================
-- RLS FORCE-TAIL (RLS Block B, Part 1 — tenant-isolation defense-in-depth)
-- Tier-1 security migration. BUILD + branch-test; GUARD re-verifies on a Neon branch + labels + merges.
-- Runs AFTER RLS Block A (#1632, merged) — the 4 open-qual tables are now real-scoped, so safe to force.
-- ----------------------------------------------------------------------------
-- GUARD live-verified (2026-06-29): 142 tables are RLS-ENABLED but NOT FORCED. The app connects as
-- ih35_app (a NON-owner), so RLS already applies to the app on these tables today and the app works —
-- forcing changes NOTHING for the app role. FORCE only newly subjects (a) the table owner neondb_owner
-- and (b) SECURITY DEFINER functions owned by neondb_owner. Exactly ONE definer function writes any
-- unforced tail table: events.log_event -> events.event_log. That table is EXCLUDED here and handled in
-- a SEPARATE Part-2 PR (it needs the app.current_operating_company_id GUC reconciled first).
--
-- Programmatic + drift-proof: force EVERY relrowsecurity=true / relforcerowsecurity=false table EXCEPT
-- the explicit EXCLUDE set (8 genuinely-global reference/lib tables — forcing an opco/true policy there
-- would be wrong/lockout — plus events.event_log). Idempotent: FORCE is a no-op when already set, and a
-- re-run finds nothing left to force. No data writes.
-- ============================================================================

DO $$
DECLARE
  r record;
  forced_count int := 0;
  -- genuinely-global reference data (no per-tenant scope) + the definer-write table (Part 2).
  excl text[] := ARRAY[
    'reference.cbp_wait_times_cache',
    'reference.cdl_endorsements',
    'reference.cdl_restrictions',
    'reference.employment_statuses',
    'reference.license_classes',
    'reference.medical_card_statuses',
    'reference.oem_parts',
    'lib.feature_flags',
    'events.event_log'
  ];
BEGIN
  FOR r IN
    SELECT ns.nspname AS sch, c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND (ns.nspname || '.' || c.relname) <> ALL (excl)
    ORDER BY ns.nspname, c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.sch, r.tbl);
    forced_count := forced_count + 1;
  END LOOP;
  RAISE NOTICE 'RLS-FORCE-TAIL: forced % tables (excluded % global/definer tables: %)',
    forced_count, array_length(excl, 1), array_to_string(excl, ', ');
END
$$;
