-- 202614720000_downtime_schema_grants.sql
--
-- verify:aggregate-schema-grants was RED on origin/main — verified by running the guard against
-- origin/main content on a clean checkout, not inferred from one branch, so every seat was blocked:
--
--   verify:aggregate-schema-grants FAIL — no GRANT USAGE ON SCHEMA … TO ih35_app in db/migrations for:
--     downtime
--
-- PRODUCTION IS FINE, AND THAT IS THE ACTUAL PROBLEM. Measured live on br-fancy-credit-akjnd07a
-- under SET LOCAL ROLE neondb_owner + SET LOCAL app.bypass_rls = 'lucia', BEFORE writing this file:
--
--   has_schema_privilege('ih35_app','downtime','USAGE')  =  true
--   ih35_app already holds SELECT/INSERT/UPDATE/DELETE on all four tables:
--     downtime.events · downtime.event_costs · downtime.event_day_reasons · downtime.lost_opportunity
--
-- So the grant reached production by some path OUTSIDE the migration history. A fresh database — CI,
-- a disaster-recovery restore, a new Neon branch — would NOT have it, and the downtime ledger that
-- the company settlement report reads (section 8) would fail there while production looks perfectly
-- healthy. That is the same class as the USMCA company row: production carries something no
-- migration creates, so the migration history cannot rebuild production.
--
-- This migration is therefore a NO-OP against production by design and a REAL FIX everywhere else.
-- It grants exactly what production already has — nothing wider. It does not invent a permission the
-- live system has not already been running with for weeks.
--
-- Additive, idempotent, CREATE/GRANT-only. No table touched, no row read or written, no RLS change.

BEGIN;

GRANT USAGE ON SCHEMA downtime TO ih35_app;

-- Named per table rather than ALL TABLES IN SCHEMA, so this file states exactly which objects it
-- grants on and a future table added to this schema does not silently inherit a grant from here.
-- Each guarded by to_regclass so a database that legitimately lacks one of them is not failed by it.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'event_costs', 'event_day_reasons', 'lost_opportunity'] LOOP
    IF to_regclass(format('downtime.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON downtime.%I TO ih35_app', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
