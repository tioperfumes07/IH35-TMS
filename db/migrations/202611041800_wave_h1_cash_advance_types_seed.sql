-- WAVE-H1 (CLS-ECON-EMPTY) — RLS-safe seed of catalogs.cash_advance_types ONLY.
-- Owner lock 2026-07-31: do NOT re-seed expense_categories / escrow_types / parts /
-- chart_of_accounts_seeds. CoA roles bind on accounting.chart_of_accounts_roles (no seed here).
-- ROOT CAUSE: 0062 __seed_company_catalog as migration owner never landed under FORCE RLS (0 rows).
-- Pattern: LST-MAINT-01 — SET ROLE ih35_app + per-opco GUC + bypass + ON CONFLICT DO NOTHING.

DO $$
DECLARE
  rec RECORD;
  v_role_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE ih35_app';
    v_role_ok := true;
  EXCEPTION
    WHEN undefined_object OR insufficient_privilege THEN
      RAISE NOTICE 'WAVE-H1: cannot SET ROLE ih35_app — skip (apply as app/owner with RESET ROLE)';
      RETURN;
  END;

  PERFORM set_config('app.bypass_rls', 'lucia', true);

  FOR rec IN
    SELECT c.id AS company_id, c.code
    FROM org.companies c
    WHERE c.deactivated_at IS NULL
      AND c.code IN ('TRANSP', 'USMCA', 'TRK')
  LOOP
    PERFORM set_config('app.operating_company_id', rec.company_id::text, true);

    INSERT INTO catalogs.cash_advance_types
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'ROUTE', 'Route advance', 'Route-related advance', '{}'::jsonb, true, 10),
      (rec.company_id, 'FUEL', 'Fuel advance', 'Fuel cash advance', '{}'::jsonb, true, 20),
      (rec.company_id, 'EMERGENCY', 'Emergency advance', 'Emergency / family advance', '{}'::jsonb, true, 30),
      (rec.company_id, 'EQUIPMENT', 'Equipment advance', 'Equipment-related advance', '{}'::jsonb, true, 40),
      (rec.company_id, 'MEDICAL', 'Medical advance', 'Medical emergency advance', '{}'::jsonb, true, 50),
      (rec.company_id, 'OTHER', 'Other advance', 'Other cash advance', '{}'::jsonb, true, 60)
    ON CONFLICT (operating_company_id, code) DO NOTHING;
  END LOOP;

  IF v_role_ok THEN
    RESET ROLE;
  END IF;
END $$;
