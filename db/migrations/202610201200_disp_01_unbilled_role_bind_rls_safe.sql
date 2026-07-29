-- DISP-01 — RLS-safe unbilled_revenue CoA role bind (TRANSP 1240 / USMCA 1150).
-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] Additive. Does NOT flip REVENUE_RECOGNITION_POST_ENABLED.
--
-- WHY: 202609290000 §3 INSERT into accounting.chart_of_accounts_roles as neondb_owner hit
-- FORCE RLS and silently left TRANSP/USMCA unbound (resolveRoleAccount fail-closed). Bind must
-- run as ih35_app with app.operating_company_id GUC set per company in the same transaction.
-- Idempotent ON CONFLICT. TRK has no unbilled account — skip by design.

DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'DISP-01 bind: chart_of_accounts_roles absent — skip';
    RETURN;
  END IF;
  IF to_regclass('catalogs.accounts') IS NULL THEN
    RAISE NOTICE 'DISP-01 bind: catalogs.accounts absent — skip';
    RETURN;
  END IF;

  -- App role required for FORCE RLS WITH CHECK on chart_of_accounts_roles.
  BEGIN
    EXECUTE 'SET LOCAL ROLE ih35_app';
  EXCEPTION
    WHEN undefined_object OR insufficient_privilege THEN
      RAISE NOTICE 'DISP-01 bind: cannot SET ROLE ih35_app — skip (owner Neon apply as app role)';
      RETURN;
  END;

  PERFORM set_config('app.bypass_rls', 'lucia', true);

  FOR rec IN
    SELECT c.id AS company_id, c.code
    FROM org.companies c
    WHERE c.code IN ('TRANSP', 'USMCA')
  LOOP
    PERFORM set_config('app.operating_company_id', rec.company_id::text, true);

    SELECT a.id INTO v_acct
    FROM catalogs.accounts a
    WHERE a.operating_company_id = rec.company_id
      AND a.deactivated_at IS NULL
      AND a.system_purpose = 'unbilled_revenue'
    ORDER BY a.account_number
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE NOTICE 'DISP-01 bind: no unbilled_revenue account for % — leave unbound', rec.code;
      CONTINUE;
    END IF;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'unbilled_revenue', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE (is_active) DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();

    RAISE NOTICE 'DISP-01 bind: % unbilled_revenue → %', rec.code, v_acct;
  END LOOP;

  -- RESET before DO ends — SET LOCAL ROLE survives the whole migration txn and blocks
  -- the migrator's INSERT into _system._schema_migrations (CI: permission denied).
  EXECUTE 'RESET ROLE';
END
$$;
