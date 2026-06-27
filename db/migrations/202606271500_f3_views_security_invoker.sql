-- F3 — set security_invoker=true on every view that lacks it (RLS-bypass fix).
--
-- Live-audit finding (2026-06-27): 6 views ran WITHOUT security_invoker, so they executed with the view
-- owner's privileges and bypassed the caller's row-level security — a cross-tenant leak vector
-- (telematics.vehicle_latest_position [GPS], factoring.v_factor_reserve_balance [financial],
--  views.dispatch_load_with_driver_status, views.maintenance_dashboard_kpis,
--  views.maintenance_severe_repair_alerts, views.maintenance_intransit_triage_queue).
--
-- Invariant (CLAUDE.md §2): every view must be security_invoker=true. This migration enforces it for ALL
-- views in user schemas, idempotently, so any view created without it is corrected here and the
-- accompanying db-test guard prevents regressions.
--
-- Idempotent: only ALTERs views still missing the option; safe to re-run (re-run = 0 changes).

DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND COALESCE(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v.nspname, v.relname);
    RAISE NOTICE 'F3: set security_invoker on %.%', v.nspname, v.relname;
  END LOOP;
END $$;
