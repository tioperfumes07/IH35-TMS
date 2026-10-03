-- 202615310700_r342_phase2a_expand_operating_company_id.sql
-- ROUND 342 Phase 2, step 2a — EXPAND. Owner ruling: one scope column; operating_company_id canonical, tenant_id retired.
--
-- 17 tables carry both columns (measured on prod 2026-10-02): factoring.{bank_match_suggestion, batch,
-- customer_factor_assignment, factor, letter_of_release, reserve_movement}; insurance.{claim, coi_request, lawsuit,
-- payment_schedule, policy, policy_unit, refund_obligation}; maintenance.internal_labor_log;
-- master_data.customer_terms_history; mdata.{mx_permits, mx_tolls_ledger}.
--
-- This step makes operating_company_id complete and authoritative WITHOUT removing anything, so code that still reads or
-- writes tenant_id keeps working through the deploy window (Render runs this before the new code serves):
--   1. per table: assert 0 rows where tenant_id and a non-NULL operating_company_id disagree — RAISE (whole migration
--      rolls back) on anything else; a real disagreement is a data question for the Lead, not a migration step
--   2. backfill operating_company_id from tenant_id where it is NULL (count reported per table; prod: 1 row,
--      insurance.payment_schedule — the writer that produced it was fixed in #24293)
--   3. operating_company_id SET NOT NULL
--   4. FK operating_company_id -> org.companies(id) where missing (13 tables had none)
--   5. an operating_company_id twin of every index that leads with / contains tenant_id — unique ones stay unique.
--      Includes uq_factoring_factor_opco_id (operating_company_id, id): the target CC-1's same-entity composite FK on
--      factoring.canonical_factor_agreements must move onto BEFORE tenant_id leaves factoring.factor.
--   6. RLS: the four policies that still scope by tenant_id (three B1 tenant_isolation policies and
--      customer_terms_history's) are replaced by the same rule on operating_company_id. On those four tables both
--      columns are NOT NULL and CHECK-equal, so visibility is identical — asserted after.
--   7. tenant_id DROP NOT NULL — so writers can stop setting it in step 2b.
-- Step 2c (later, after CC-1 confirms the coi_request sync trigger is gone and the canonical_factor_agreements FKs are on
-- operating_company_id) drops tenant_id, its CHECKs, FKs and indexes.

BEGIN;

DO $$
DECLARE
  t text;
  v_disagree bigint;
  v_backfilled bigint;
  v_fk boolean;
  tables text[] := ARRAY[
    'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
    'factoring.letter_of_release', 'factoring.reserve_movement',
    'insurance.claim', 'insurance.coi_request', 'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy',
    'insurance.policy_unit', 'insurance.refund_obligation',
    'maintenance.internal_labor_log', 'master_data.customer_terms_history', 'mdata.mx_permits', 'mdata.mx_tolls_ledger'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 1. assert
    EXECUTE format('SELECT count(*) FROM %s WHERE operating_company_id IS NOT NULL AND tenant_id IS DISTINCT FROM operating_company_id', t)
      INTO v_disagree;
    IF v_disagree <> 0 THEN
      RAISE EXCEPTION 'ROUND 342 Phase 2a refused: % has % row(s) where tenant_id and operating_company_id disagree — bring them to the Lead', t, v_disagree;
    END IF;
    -- 2. backfill
    EXECUTE format('UPDATE %s SET operating_company_id = tenant_id WHERE operating_company_id IS NULL', t);
    GET DIAGNOSTICS v_backfilled = ROW_COUNT;
    RAISE NOTICE 'R342-2a % : disagree=0 backfilled=%', t, v_backfilled;
    -- 3. NOT NULL
    EXECUTE format('ALTER TABLE %s ALTER COLUMN operating_company_id SET NOT NULL', t);
    -- 4. FK to org.companies where none exists
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = t::regclass AND contype = 'f'
         AND confrelid = 'org.companies'::regclass
         AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (operating_company_id) REFERENCES org.companies(id)%'
    ) INTO v_fk;
    IF NOT v_fk THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (operating_company_id) REFERENCES org.companies(id)',
                     t, split_part(t, '.', 2) || '_operating_company_id_fkey');
    END IF;
    -- 7. tenant_id becomes optional (dropped in 2c)
    EXECUTE format('ALTER TABLE %s ALTER COLUMN tenant_id DROP NOT NULL', t);
  END LOOP;
END $$;

-- 5. operating_company_id twin of every tenant_id index on the 17 tables (unique stays unique; partial predicates kept).
DO $$
DECLARE
  r record;
  v_name text;
  v_def text;
BEGIN
  FOR r IN
    SELECT ic.relname AS idx, ns.nspname AS sch, pg_get_indexdef(i.indexrelid) AS def
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_class tc ON tc.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = tc.relnamespace
     WHERE (ns.nspname || '.' || tc.relname) = ANY (ARRAY[
             'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
             'factoring.letter_of_release', 'factoring.reserve_movement',
             'insurance.claim', 'insurance.coi_request', 'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy',
             'insurance.policy_unit', 'insurance.refund_obligation',
             'maintenance.internal_labor_log', 'master_data.customer_terms_history', 'mdata.mx_permits', 'mdata.mx_tolls_ledger'])
       AND pg_get_indexdef(i.indexrelid) ~ '\mtenant_id\M'
       AND NOT i.indisprimary
  LOOP
    v_name := CASE
      WHEN r.idx = 'uq_factoring_factor_tenant_id' THEN 'uq_factoring_factor_opco_id'
      WHEN r.idx ~ 'tenant_id' THEN replace(r.idx, 'tenant_id', 'opco')
      WHEN r.idx ~ 'tenant' THEN replace(r.idx, 'tenant', 'opco')
      ELSE left(r.idx, 58) || '_opco'
    END;
    v_def := regexp_replace(r.def, '\mtenant_id\M', 'operating_company_id', 'g');
    v_def := regexp_replace(v_def, '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX IF NOT EXISTS ' || quote_ident(v_name) || ' ON ');
    EXECUTE v_def;
    RAISE NOTICE 'R342-2a index % -> %', r.idx, v_name;
  END LOOP;
END $$;

-- 6. RLS — the four policies still keyed on tenant_id, replaced by the same rule on operating_company_id.
DROP POLICY IF EXISTS mx_permits_opco_isolation ON mdata.mx_permits;
CREATE POLICY mx_permits_opco_isolation ON mdata.mx_permits
  USING (operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid);
DROP POLICY IF EXISTS mx_permits_tenant_isolation ON mdata.mx_permits;

DROP POLICY IF EXISTS mx_tolls_opco_isolation ON mdata.mx_tolls_ledger;
CREATE POLICY mx_tolls_opco_isolation ON mdata.mx_tolls_ledger
  USING (operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid);
DROP POLICY IF EXISTS mx_tolls_tenant_isolation ON mdata.mx_tolls_ledger;

DROP POLICY IF EXISTS internal_labor_log_opco_isolation ON maintenance.internal_labor_log;
CREATE POLICY internal_labor_log_opco_isolation ON maintenance.internal_labor_log
  USING (operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid);
DROP POLICY IF EXISTS internal_labor_log_tenant_isolation ON maintenance.internal_labor_log;

DROP POLICY IF EXISTS customer_terms_history_opco_scope ON master_data.customer_terms_history;
CREATE POLICY customer_terms_history_opco_scope ON master_data.customer_terms_history
  USING (identity.is_lucia_bypass() OR EXISTS (
    SELECT 1 FROM mdata.customers c
     WHERE c.id = customer_terms_history.customer_uuid
       AND c.operating_company_id = customer_terms_history.operating_company_id
       AND c.operating_company_id::text = current_setting('app.operating_company_id', true)))
  WITH CHECK (identity.is_lucia_bypass() OR EXISTS (
    SELECT 1 FROM mdata.customers c
     WHERE c.id = customer_terms_history.customer_uuid
       AND c.operating_company_id = customer_terms_history.operating_company_id
       AND c.operating_company_id::text = current_setting('app.operating_company_id', true)));
DROP POLICY IF EXISTS customer_terms_history_tenant_scope ON master_data.customer_terms_history;

-- Post-conditions: no policy on the 17 tables reads tenant_id; every table still has a policy; every tenant_id index has
-- its twin; operating_company_id is NOT NULL everywhere; the FK target CC-1 needs exists.
DO $$
DECLARE
  v int;
BEGIN
  SELECT count(*) INTO v FROM pg_policy
   WHERE polrelid::regclass::text = ANY (ARRAY[
           'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
           'factoring.letter_of_release', 'factoring.reserve_movement', 'insurance.claim', 'insurance.coi_request',
           'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy', 'insurance.policy_unit',
           'insurance.refund_obligation', 'maintenance.internal_labor_log', 'master_data.customer_terms_history',
           'mdata.mx_permits', 'mdata.mx_tolls_ledger'])
     AND (pg_get_expr(polqual, polrelid) ~ '\mtenant_id\M' OR coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ '\mtenant_id\M');
  IF v <> 0 THEN RAISE EXCEPTION 'ROUND 342 Phase 2a: % policy(ies) on the 17 tables still read tenant_id', v; END IF;

  SELECT count(*) INTO v FROM unnest(ARRAY[
           'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
           'factoring.letter_of_release', 'factoring.reserve_movement', 'insurance.claim', 'insurance.coi_request',
           'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy', 'insurance.policy_unit',
           'insurance.refund_obligation', 'maintenance.internal_labor_log', 'master_data.customer_terms_history',
           'mdata.mx_permits', 'mdata.mx_tolls_ledger']) t
   WHERE NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t::regclass AND p.polcmd = '*');
  IF v <> 0 THEN RAISE EXCEPTION 'ROUND 342 Phase 2a: % table(s) left without an all-commands policy', v; END IF;

  SELECT count(*) INTO v FROM information_schema.columns
   WHERE column_name = 'operating_company_id' AND is_nullable = 'YES'
     AND (table_schema || '.' || table_name) = ANY (ARRAY[
           'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
           'factoring.letter_of_release', 'factoring.reserve_movement', 'insurance.claim', 'insurance.coi_request',
           'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy', 'insurance.policy_unit',
           'insurance.refund_obligation', 'maintenance.internal_labor_log', 'master_data.customer_terms_history',
           'mdata.mx_permits', 'mdata.mx_tolls_ledger']);
  IF v <> 0 THEN RAISE EXCEPTION 'ROUND 342 Phase 2a: % table(s) still allow a NULL operating_company_id', v; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
     WHERE ic.relname = 'uq_factoring_factor_opco_id' AND i.indisunique
       AND i.indrelid = 'factoring.factor'::regclass
       AND pg_get_indexdef(i.indexrelid) LIKE '%(operating_company_id, id)%'
  ) THEN
    RAISE EXCEPTION 'ROUND 342 Phase 2a: uq_factoring_factor_opco_id (operating_company_id, id) missing — CC-1''s same-entity FK has no target';
  END IF;
END $$;

COMMIT;
