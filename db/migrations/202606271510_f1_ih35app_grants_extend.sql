-- F1 — restore/extend ih35_app grants on app-queried schemas missing them (live 500 fix).
--
-- Live-audit finding (2026-06-27): 65 base tables the runtime role `ih35_app` could NOT SELECT →
-- `permission denied` (42501) → HTTP 500. Confirmed live, unguarded callers:
--   * safety.accident_reports        — foundation-kpis.routes.ts:68 (raw COUNT), safety.routes.ts (FROM/UPDATE)
--   * owner.todays_attention_snapshot — owner/todays-attention/routes.ts (the to_regclass guard checks
--                                       EXISTENCE, not PRIVILEGE, so it does NOT prevent the 500)
-- Root cause: migration 0065's grant array covers `safety` (a one-time GRANT — accident_reports was created
-- LATER so it was never granted) but does NOT list `owner`, `analytics`, or `alerts` at all.
--
-- Fix: re-run the 0065 grant pattern for the affected app schemas AND add DEFAULT PRIVILEGES so tables
-- created later in these schemas can't recur the defect. Idempotent (GRANT + ALTER DEFAULT PRIVILEGES are
-- safe to re-run); each schema guarded by existence so it is a no-op on a fresh CI DB lacking the schema.
--
-- NOTE: the legacy `settlement.*` schema and the public.audit_log_* partitions are intentionally NOT granted
-- here — `settlement.*` has no live FROM/JOIN query site (canonical is driver_finance.*), and the audit_log
-- partitions are read through their granted parent. Granting them would be over-grant on dead/internal objects.

DO $$
DECLARE
  s text;
  schemas text[] := ARRAY['safety', 'owner', 'analytics', 'alerts'];
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO ih35_app', s);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ih35_app', s);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO ih35_app', s);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app', s);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO ih35_app', s);
      RAISE NOTICE 'F1: (re)granted ih35_app on schema %', s;
    END IF;
  END LOOP;
END $$;
