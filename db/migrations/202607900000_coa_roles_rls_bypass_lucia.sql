-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER / RLS-POLICY CHANGE] *** DO NOT RUN ON PROD. DO NOT
-- SELF-MERGE. *** Runs only on a Neon branch by Jorge's hand, then ledger-backfilled.
--
-- FIX-COA-ROLES-RLS-BYPASS — restore Rule 10 GUC-bypass visibility on
-- accounting.chart_of_accounts_roles (false-empty audit landmine).
--
-- ROOT CAUSE (proven, Rule 10 discipline): policy coa_roles_company_scope (migration
-- 0223_block_35_chart_of_accounts_roles.sql) has USING/WITH CHECK that check ONLY
-- app.operating_company_id — there is NO `app.bypass_rls = 'lucia'` escape branch. Any
-- audit/background/service-context read that follows Rule 10's own instruction
-- (SET app.bypass_rls='lucia') against this table returns a FALSE 0 even though 89 live
-- rows exist (TRANSP-scoped = 31). This is exactly the "RLS 0-COUNT LANDMINE" the always-
-- apply verification rule warns about, and it is a REAL gap on THIS table, not a masked
-- read — the policy itself has no bypass branch to honor the GUC.
--
-- WHY THIS IS THE CORRECT FIX AND NOT A HOLE PUNCHED IN THE POLICY LAYER: the GUC-escape is
-- this system's intended service-context pattern (see 202607610000_qbo_connections_rls_
-- bypass_escape.sql for the prior instance of the identical retrofit). Dozens of opco-scoped
-- tables already carry `OR current_setting('app.bypass_rls', true) = 'lucia'` in their USING
-- clause; accounting.chart_of_accounts_roles (0223) predates that pattern and was never
-- retrofitted. This migration closes exactly that one gap.
--
-- SECURITY — narrower than a blanket change, mirrors 202607610000 exactly:
--   * The escape is added to USING (read visibility) ONLY. WITH CHECK is left scoped to the
--     real operating_company_id, so this migration grants NO new write authority — every
--     existing writer (CoaRoles page / role-designation service) already sets the real
--     app.operating_company_id before writing and is unaffected.
--   * ih35_app ALREADY holds SELECT/INSERT/UPDATE/DELETE on this table (0223 GRANT); this
--     changes WHICH ROWS a bypass-mode service context sees, not whether the role may read
--     the table at all.
--   * Scope is exactly ONE table. No blanket policy change across the accounting schema.
--   * FORCE ROW LEVEL SECURITY status is UNCHANGED by this migration (RLS policy content
--     only) — this migration does not enable, disable, or force RLS on the table.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Additive: no data change, no column change, no
-- grant change, no DELETE of any row. Rollback = re-create the policy without the escape.
--
-- [FINANCIAL-CLUSTER / RLS-POLICY CHANGE — OWNER APPLIES. DO NOT RUN ON PROD. DO NOT SELF-MERGE.]

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'accounting.chart_of_accounts_roles absent — skipping (fresh-DB CI ordering)';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS coa_roles_company_scope ON accounting.chart_of_accounts_roles;

  CREATE POLICY coa_roles_company_scope
    ON accounting.chart_of_accounts_roles
    FOR ALL
    TO ih35_app
    USING (
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    WITH CHECK (
      -- UNCHANGED on purpose: writes stay strictly entity-scoped. No new write authority.
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    );
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   BEGIN;
--     SELECT set_config('app.bypass_rls', 'lucia', true);
--     SELECT count(*) FROM accounting.chart_of_accounts_roles;  -- expect 89, not 0
--   ROLLBACK;
--   -- and confirm entity-scoped reads are unaffected:
--   BEGIN;
--     SET app.operating_company_id = '<TRANSP>';
--     SELECT count(*) FROM accounting.chart_of_accounts_roles;  -- expect 31
--   ROLLBACK;
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   Re-create coa_roles_company_scope with USING/WITH CHECK restricted to the
--   app.operating_company_id comparison only (no bypass_rls branch).
