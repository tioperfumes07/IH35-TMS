-- 202614720000_downtime_schema_grants.sql
-- verify:aggregate-schema-grants is RED on main: apps/backend/src/accounting/company-settlement-report.service.ts
-- (ROUND 285.4.9/#58, PR #23338) and apps/backend/src/maintenance/kpi.routes.ts query downtime.events,
-- downtime.event_costs, and downtime.lost_opportunity, but no migration ever created or granted the
-- downtime schema. Live-verified 2026-09-30: the schema and its 4 tables (events, event_costs,
-- lost_opportunity, event_day_reasons) already exist in production, but ih35_app has ZERO usage
-- privileges on them -- meaning every one of those real, live queries 500s at runtime today
-- ("permission denied for schema downtime"). A fresh database (CI, DR restore, a new branch) would
-- not even have the schema. This migration is additive/idempotent and matches migration 0065's own
-- per-schema grant shape; it does not touch company-settlement-report.service.ts (locked, PR #23410)
-- or kpi.routes.ts -- grants only.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'downtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA downtime TO ih35_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA downtime TO ih35_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA downtime TO ih35_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA downtime GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA downtime GRANT USAGE, SELECT ON SEQUENCES TO ih35_app';
    RAISE NOTICE 'Grants applied to schema: downtime';
  ELSE
    RAISE NOTICE 'Schema does not exist, skipping: downtime';
  END IF;
END $$;

COMMIT;
