-- 202615420900 — re-run the 0359 NULLIF sweep (CC-3, 2026-10-05; claimed #25493).
--
-- MEASURED (prod, pg_policies): five live policies still cast current_setting('app.operating_company_id')::uuid bare —
--   dispatch.customer_notify_preferences, dispatch.notify_log (0355), maintenance.pm_schedule_runs,
--   maintenance.pm_auto_wo_log, maintenance.pm_auto_engine_settings (0360).
-- A pooled connection that ran a transaction-local set_config holds '' afterwards, and ''::uuid raises 22P02 — the
-- query dies instead of returning zero rows (the INFRA-2 healthz outage 0359 fixed).
--
-- ROOT CAUSE: 0359 was a ONE-SHOT sweep of whatever policies existed when it ran. 0355 merged after it (#438 after
-- #430) and the pm_* policies reached prod bare, so neither was ever swept; verify-rls-uuid-cast-nullif skipped every
-- file numbered below 0359 and never read the live catalog. The guard now reads pg_policies too.
--
-- Same body as 0359: ALTER POLICY only, no DROP; already-wrapped NULLIF casts never match, so it is idempotent.
-- Writes no rows.

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

    -- pg_get_expr() decompiles a function-call cast with wrapping parens, e.g.
    --   (current_setting('app.operating_company_id'::text, true))::uuid
    -- so the match/replace must target that exact shape. Already-wrapped
    -- NULLIF(...) casts never match, keeping this migration idempotent.
    IF new_qual IS NOT NULL
       AND new_qual ~ '\(current_setting\([^()]+\)\)::uuid' THEN
      new_qual := regexp_replace(
        new_qual,
        '\(current_setting\(([^()]+)\)\)::uuid',
        '(NULLIF(current_setting(\1), ''''::text))::uuid',
        'g'
      );
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        pol.policyname, pol.schemaname, pol.tablename, new_qual
      );
      updated_count := updated_count + 1;
    END IF;

    IF new_check IS NOT NULL
       AND new_check ~ '\(current_setting\([^()]+\)\)::uuid' THEN
      new_check := regexp_replace(
        new_check,
        '\(current_setting\(([^()]+)\)\)::uuid',
        '(NULLIF(current_setting(\1), ''''::text))::uuid',
        'g'
      );
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, new_check
      );
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'rls_uuid_cast_defensive_resweep: updated % policy expression(s)', updated_count;
END $$;

COMMIT;
