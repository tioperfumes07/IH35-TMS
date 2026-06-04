-- INFRA-2: Defensive NULLIF wrap on RLS policies that cast current_setting() to uuid.
-- Drift capture (2026-06-03): /api/v1/healthz qbo.sync_alerts.unresolved_depth failed with
-- "invalid input syntax for type uuid: ''" when withLuciaBypass omitted tenant session vars.
-- Postgres evaluates ::uuid casts eagerly in RLS OR expressions before short-circuit.
-- Fix: wrap every live policy expression sourcing current_setting(...)::uuid with NULLIF(...,'')::uuid.
-- ARCHIVE-not-DELETE: ALTER POLICY only — no DROP POLICY.

BEGIN;

DO $$
DECLARE
  pol RECORD;
  new_qual text;
  new_check text;
  updated_count integer := 0;
BEGIN
  FOR pol IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS tablename,
      p.polname AS policyname,
      pg_get_expr(p.polqual, p.polrelid) AS qual,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    new_qual := pol.qual;
    new_check := pol.with_check;

    IF new_qual IS NOT NULL
       AND new_qual ~ 'current_setting\([^)]+\)::uuid'
       AND new_qual !~ 'NULLIF\s*\(\s*current_setting' THEN
      new_qual := regexp_replace(
        new_qual,
        'current_setting(\([^)]+\))::uuid',
        'NULLIF(current_setting\1, '''')::uuid',
        'g'
      );
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        pol.policyname, pol.schemaname, pol.tablename, new_qual
      );
      updated_count := updated_count + 1;
    END IF;

    IF new_check IS NOT NULL
       AND new_check ~ 'current_setting\([^)]+\)::uuid'
       AND new_check !~ 'NULLIF\s*\(\s*current_setting' THEN
      new_check := regexp_replace(
        new_check,
        'current_setting(\([^)]+\))::uuid',
        'NULLIF(current_setting\1, '''')::uuid',
        'g'
      );
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, new_check
      );
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'rls_uuid_cast_defensive: updated % policy expression(s)', updated_count;
END $$;

COMMIT;
