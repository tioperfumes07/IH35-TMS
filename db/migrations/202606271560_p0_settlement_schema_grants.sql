-- P0 — Grant ih35_app access to the `settlement` schema (live 500 fix).
--
-- Root cause (2026-06-27 audit): migration 202606120100_c1_pre_settlements.sql created
-- the `settlement` schema and its three tables, enabled RLS, and set company-isolation
-- policies — but issued ZERO grants to ih35_app. Result: every call through
-- settlements/approval.service.ts, settlements/pre-settlements.routes.ts, and
-- driver-finance/settlement-pdf-renderer.service.ts produces `permission denied for
-- schema settlement` (42501) → HTTP 500 on all settlement approval operations.
--
-- Callers confirmed (4 files, 15+ query sites):
--   settlements/approval.routes.ts      — SELECT approval_status
--   settlements/approval.service.ts     — SELECT/UPDATE settlement; SELECT/UPDATE settlement_line
--   settlements/pre-settlements.routes.ts — SELECT settlement, settlement_line
--   driver-finance/settlement-pdf-renderer.service.ts — SELECT settlement_line
--
-- Tables granted (all three in the schema):
--   settlement.settlement
--   settlement.settlement_line
--   settlement.settlement_deduction
--
-- Idempotent: GRANT is a no-op if already granted; schema-existence guard prevents
-- failure on fresh CI databases that lack the schema.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'settlement') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA settlement TO ih35_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA settlement TO ih35_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA settlement TO ih35_app';
    -- Default privileges: tables created later in this schema are auto-granted.
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA settlement GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA settlement GRANT USAGE, SELECT ON SEQUENCES TO ih35_app';
    RAISE NOTICE 'P0: (re)granted ih35_app on schema settlement';
  ELSE
    RAISE NOTICE 'P0: schema settlement does not exist — skipping (fresh CI DB)';
  END IF;
END $$;
