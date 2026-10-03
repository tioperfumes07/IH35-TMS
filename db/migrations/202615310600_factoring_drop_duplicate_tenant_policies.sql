-- 202615310600_factoring_drop_duplicate_tenant_policies.sql
-- ROUND 342 Phase 4 (owner ruling: merge the two scope columns into one — operating_company_id canonical, tenant_id
-- retired). Three factoring tables carried TWO permissive RLS policies, one per scope column, both compared to the same
-- session variable app.operating_company_id. PostgreSQL CREATE POLICY: "All permissive policies which are applicable to
-- a given query will be combined together using the Boolean 'OR' operator." So each row was visible if EITHER column
-- matched — the day the columns disagree on a row, two carriers see it, on the table that decides which customer is
-- factored to which factor.
--
-- This drops the tenant_id-keyed policy on each table; the operating_company_id policy (USING + WITH CHECK, lucia bypass
-- for the owner tooling) remains the only one. The writers of factoring.factor and factoring.letter_of_release set only
-- tenant_id until this PR — they now set operating_company_id explicitly (factor.service.ts), so the remaining policy's
-- WITH CHECK accepts their inserts.
--
-- Pre-arm: a row whose operating_company_id is NULL or differs from tenant_id is visible today ONLY through the policy
-- being dropped, so dropping it would hide that row from every carrier. The DO block refuses to proceed if any exists —
-- that is a data question for the Lead, not a migration step. Measured on prod 2026-10-02: 1,222 / 2 / 0 rows, 0 / 0 / 0.

BEGIN;

DO $$
DECLARE
  v_bad bigint;
BEGIN
  SELECT (SELECT count(*) FROM factoring.customer_factor_assignment
           WHERE operating_company_id IS NULL OR operating_company_id IS DISTINCT FROM tenant_id)
       + (SELECT count(*) FROM factoring.factor
           WHERE operating_company_id IS NULL OR operating_company_id IS DISTINCT FROM tenant_id)
       + (SELECT count(*) FROM factoring.letter_of_release
           WHERE operating_company_id IS NULL OR operating_company_id IS DISTINCT FROM tenant_id)
    INTO v_bad;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ROUND 342 Phase 4 refused: % factoring row(s) have operating_company_id NULL or different from tenant_id — dropping the tenant policy would hide them. Bring them to the Lead.', v_bad;
  END IF;
END $$;

DROP POLICY IF EXISTS factoring_customer_factor_assignment_tenant_scope_v2 ON factoring.customer_factor_assignment;
DROP POLICY IF EXISTS factoring_factor_tenant_scope_v2 ON factoring.factor;
DROP POLICY IF EXISTS factoring_lor_tenant_scope ON factoring.letter_of_release;

-- Post-condition: exactly one policy per table, and it keys on operating_company_id.
DO $$
DECLARE
  r record;
  v_tables int := 0;
BEGIN
  FOR r IN
    SELECT c.relname, count(*) AS n,
           bool_and(pg_get_expr(p.polqual, p.polrelid) LIKE '%operating_company_id%') AS on_opco
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'factoring'
       AND c.relname IN ('customer_factor_assignment', 'factor', 'letter_of_release')
     GROUP BY c.relname
  LOOP
    IF r.n <> 1 OR NOT r.on_opco THEN
      RAISE EXCEPTION 'ROUND 342 Phase 4: factoring.% has % policies (on operating_company_id: %), expected exactly 1', r.relname, r.n, r.on_opco;
    END IF;
    v_tables := v_tables + 1;
  END LOOP;
  IF v_tables <> 3 THEN
    RAISE EXCEPTION 'ROUND 342 Phase 4: only % of the 3 factoring tables still have a policy — a table with none is unscoped', v_tables;
  END IF;
END $$;

COMMIT;
