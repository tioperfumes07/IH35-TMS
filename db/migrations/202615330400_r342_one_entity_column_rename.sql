-- 202615330400_r342_one_entity_column_rename.sql
-- CC-1 · Lead ROUND 342 phases 1 / 3 / 5 — ONE ENTITY COLUMN. Owner ruling: merge into one; operating_company_id is
-- canonical, tenant_id is retired. This is a RENAME, not add-backfill-drop.
--
-- WHY RENAME. ALTER TABLE ... RENAME COLUMN moves no rows and keeps NOT NULL, foreign keys, indexes, CHECKs and RLS
-- policies, because PostgreSQL binds them to the attribute number, not the name. Add-column-and-backfill is what
-- produced a nullable twin that hid a live USMCA row (insurance.payment_schedule) behind a policy keyed on NULL.
--
-- DERIVED FROM PROD 2026-10-02 (information_schema, bypass) — not from the order's list:
--   17 BASE TABLES carry tenant_id and NO operating_company_id (phase 1, renamed here) + 1 view whose output column
--   is renamed here (factoring.v_factor_reserve_balance; renaming a base column does NOT rename a view's output).
--   17 tables carry BOTH — CC-2's phase 2; not touched here, and listed in the event trigger's legacy set until
--   CC-2 drops the column. The two sets do not overlap.
--   26 of 1,157 policies read tenant_id (19 on the phase-1 tables follow the rename automatically).
--   3 functions reference tenant_id; 203 triggers run audit.tg_audit_row — ONE body, repointed here, not 203 fixes.
--
-- PHASE 3:
--   audit.tg_audit_row — writes audit.row_changes.operating_company_id (renamed in phase 1) and resolves the company
--     from operating_company_id FIRST; tenant_id stays only as a fallback for CC-2's 17 legacy tables (e.g.
--     insurance.payment_schedule carries a NULL operating_company_id until phase 2 lands) — named debt in the guard.
--   factoring.prevent_canonical_factor_agreement_term_mutation — NEW/OLD.operating_company_id.
--   insurance.coi_request_sync_operating_company_id — trigger AND function DROPPED (the fifth copy of the patch; the
--     app writes both columns on insert, coi.service.ts, so nothing depended on the copy).
--
-- THE COMPOSITE SAME-ENTITY FOREIGN KEYS on factoring.canonical_factor_agreements make a cross-carrier factor
-- agreement structurally impossible. The vendor FK already targets mdata.vendors(operating_company_id, id) and simply
-- follows the rename. The profile FK targeted factoring.factor(tenant_id, id); it is rebuilt here onto
-- factoring.factor(operating_company_id, id) — the twin index uq_factoring_factor_opco_id that CC-2's 202615310700
-- created for exactly this — so CC-2 can later drop tenant_id from factoring.factor without killing it.
-- In the same place, the TAUTOLOGY in both write policies (fp.tenant_id = fp.tenant_id, always true — the factor
-- profile's entity was never checked at the policy level) is corrected to
-- fp.operating_company_id = canonical_factor_agreements.operating_company_id. Fixed once, with the FK, per the Lead.
--
-- PHASE 5 — permanent: event trigger trg_refuse_tenant_id_column on ddl_command_end refuses a table / view that
-- carries a tenant_id column and any RLS policy whose expression reads tenant_id, outside CC-2's named legacy set.
-- insurance.type_catalog keeps USING (true): a deliberately shared catalog across the three carriers — renamed, never
-- scoped.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT set_config('app.bypass_rls', 'lucia', true);

-- ── precondition: CC-2's twin target index exists (202615310700) ────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('factoring.factor') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = 'factoring.factor'::regclass AND c.relname = 'uq_factoring_factor_opco_id' AND i.indisunique) THEN
    RAISE EXCEPTION '202615330400: factoring.factor has no uq_factoring_factor_opco_id (operating_company_id, id) — apply CC-2''s 202615310700 first';
  END IF;
END $$;

-- ── PHASE 1: one RENAME per table ───────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting.bill_unit_allocation', 'accounting.coa_account', 'accounting.ps_category', 'accounting.ps_item',
    'accounting.pse_posting_policy', 'accounting.vendor_subtype_pse_map', 'audit.row_changes',
    'factoring.canonical_factor_agreements', 'insurance.type_catalog', 'integrity.anomalies', 'integrity.anomaly',
    'integrity.driver_metric', 'integrity.metric', 'maint.part', 'maint.pm_schedule', 'mdata.asset_status_history',
    'mdata.assets'
  ] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = t::regclass AND attname = 'operating_company_id' AND NOT attisdropped) THEN
      CONTINUE;  -- already renamed (idempotent)
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = t::regclass AND attname = 'tenant_id' AND NOT attisdropped) THEN
      EXECUTE format('ALTER TABLE %s RENAME COLUMN tenant_id TO operating_company_id', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('factoring.v_factor_reserve_balance') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'factoring.v_factor_reserve_balance'::regclass AND attname = 'tenant_id') THEN
    ALTER VIEW factoring.v_factor_reserve_balance RENAME COLUMN tenant_id TO operating_company_id;
  END IF;
END $$;

-- ── PHASE 3a: the audit writer behind 203 triggers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit.tg_audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_source jsonb;
  v_company_text text;
  v_user_text text;
  v_company_id uuid;
  v_changed_by_user uuid;
  v_changed_by_role text;
  v_pk text;
  v_noise_keys text[];
BEGIN
  -- ACCT-F259 — derive the noise keys from THIS row's own document instead of a hard-coded list, so a
  -- new sync-stamp spelling is covered the day it appears rather than silently re-opening the gap.
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(key), ARRAY[]::text[])
      INTO v_noise_keys
      FROM jsonb_each(to_jsonb(NEW))
     WHERE key = 'updated_at'
        OR key LIKE '%\_synced\_at';

    IF (to_jsonb(OLD) - v_noise_keys) IS NOT DISTINCT FROM (to_jsonb(NEW) - v_noise_keys) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_source := to_jsonb(OLD);
  ELSE
    v_source := to_jsonb(NEW);
  END IF;

  -- ROUND 342: operating_company_id is the canonical company column. The legacy key is read only as a fallback for
  -- the double-scoped tables still carrying it (CC-2 phase 2) — remove that line when the last one drops it.
  v_company_text := COALESCE(
    v_source->>'operating_company_id',
    v_source->>'tenant_id',
    v_source->>'owner_company_id',
    v_source->>'default_company_id',
    v_source->>'company_id'
  );
  IF v_company_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_company_id := v_company_text::uuid;
  END IF;

  -- ACCT-F177 / FAIL-AUDIT-ACTOR — app.current_user_id is set by withCurrentUser and (since #4969) by
  -- withLuciaBypass when the caller supplies an actor; app.user_id is kept as a legacy fallback.
  v_user_text := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    NULLIF(current_setting('app.user_id', true), '')
  );
  IF v_user_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_changed_by_user := v_user_text::uuid;
  END IF;

  v_changed_by_role := NULLIF(current_setting('app.user_role', true), '');
  IF v_changed_by_role IS NULL AND v_changed_by_user IS NOT NULL THEN
    SELECT u.role::text INTO v_changed_by_role
      FROM identity.users u
     WHERE u.id = v_changed_by_user;
  END IF;

  v_pk := COALESCE(v_source->>'id', v_source->>'uuid', md5(v_source::text));

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit.row_changes (
      operating_company_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
    ) VALUES (
      v_company_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'DELETE', v_pk, to_jsonb(OLD), NULL, v_changed_by_user,
      v_changed_by_role,
      NULLIF(current_setting('app.session_id', true), '')
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit.row_changes (
      operating_company_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
    ) VALUES (
      v_company_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'UPDATE', v_pk, to_jsonb(OLD), to_jsonb(NEW), v_changed_by_user,
      v_changed_by_role,
      NULLIF(current_setting('app.session_id', true), '')
    );
    RETURN NEW;
  END IF;

  INSERT INTO audit.row_changes (
    operating_company_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
  ) VALUES (
    v_company_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'INSERT', v_pk, NULL, to_jsonb(NEW), v_changed_by_user,
    v_changed_by_role,
    NULLIF(current_setting('app.session_id', true), '')
  );
  RETURN NEW;
END;
$function$;

-- ── PHASE 3b: the agreement immutability trigger ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION factoring.prevent_canonical_factor_agreement_term_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      -- Allowed mutations: close window (effective_to), void/archive, audit actor — never terms/identity.
      IF NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id
         OR NEW.factor_profile_id IS DISTINCT FROM OLD.factor_profile_id
         OR NEW.factor_vendor_id IS DISTINCT FROM OLD.factor_vendor_id
         OR NEW.agreement_code IS DISTINCT FROM OLD.agreement_code
         OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
         OR NEW.is_full_recourse IS DISTINCT FROM OLD.is_full_recourse
         OR NEW.fee_rate_tier1 IS DISTINCT FROM OLD.fee_rate_tier1
         OR NEW.fee_rate_tier2 IS DISTINCT FROM OLD.fee_rate_tier2
         OR NEW.reserve_rate IS DISTINCT FROM OLD.reserve_rate
         OR NEW.repurchase_term_days IS DISTINCT FROM OLD.repurchase_term_days
         OR NEW.grace_days IS DISTINCT FROM OLD.grace_days
         OR NEW.repurchase_deadline_days IS DISTINCT FROM OLD.repurchase_deadline_days
         OR NEW.default_interest_daily_rate IS DISTINCT FROM OLD.default_interest_daily_rate
         OR NEW.created_at IS DISTINCT FROM OLD.created_at
         OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
         OR NEW.id IS DISTINCT FROM OLD.id
      THEN
        RAISE EXCEPTION 'canonical_factor_agreement_terms_immutable: historical Faro terms cannot be rewritten — insert a new effective-dated version or void/archive'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      -- Once voided, freeze further mutations (except no-op).
      IF OLD.voided_at IS NOT NULL AND (
           NEW.voided_at IS DISTINCT FROM OLD.voided_at
           OR NEW.voided_by_user_id IS DISTINCT FROM OLD.voided_by_user_id
           OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
         ) THEN
        RAISE EXCEPTION 'canonical_factor_agreement_already_voided: cannot mutate a voided agreement version'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END IF;
    RETURN NEW;
  END
  $function$;

-- ── PHASE 3c: the column-copy patch goes ────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_coi_request_sync_operating_company_id ON insurance.coi_request;
DROP FUNCTION IF EXISTS insurance.coi_request_sync_operating_company_id();

-- ── the profile same-entity FK onto the canonical column; the policy tautology corrected with it ───────────────
DO $$
BEGIN
  IF to_regclass('factoring.canonical_factor_agreements') IS NULL THEN RETURN; END IF;
  ALTER TABLE factoring.canonical_factor_agreements DROP CONSTRAINT IF EXISTS canonical_factor_agreements_profile_same_entity_fkey;
  ALTER TABLE factoring.canonical_factor_agreements
    ADD CONSTRAINT canonical_factor_agreements_profile_same_entity_fkey
    FOREIGN KEY (operating_company_id, factor_profile_id) REFERENCES factoring.factor (operating_company_id, id);

  DROP POLICY IF EXISTS canonical_factor_agreements_entity_insert ON factoring.canonical_factor_agreements;
  CREATE POLICY canonical_factor_agreements_entity_insert ON factoring.canonical_factor_agreements
    AS PERMISSIVE FOR INSERT TO ih35_app
    WITH CHECK (identity.is_lucia_bypass() OR (
      (operating_company_id)::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])
      AND EXISTS (SELECT 1 FROM mdata.vendors v
                   WHERE v.id = canonical_factor_agreements.factor_vendor_id
                     AND v.operating_company_id = canonical_factor_agreements.operating_company_id)
      AND EXISTS (SELECT 1 FROM factoring.factor fp
                   WHERE fp.id = canonical_factor_agreements.factor_profile_id
                     AND fp.operating_company_id = canonical_factor_agreements.operating_company_id)));

  DROP POLICY IF EXISTS canonical_factor_agreements_entity_update ON factoring.canonical_factor_agreements;
  CREATE POLICY canonical_factor_agreements_entity_update ON factoring.canonical_factor_agreements
    AS PERMISSIVE FOR UPDATE TO ih35_app
    USING (identity.is_lucia_bypass() OR (
      (operating_company_id)::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
    WITH CHECK (identity.is_lucia_bypass() OR (
      (operating_company_id)::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])
      AND EXISTS (SELECT 1 FROM mdata.vendors v
                   WHERE v.id = canonical_factor_agreements.factor_vendor_id
                     AND v.operating_company_id = canonical_factor_agreements.operating_company_id)
      AND EXISTS (SELECT 1 FROM factoring.factor fp
                   WHERE fp.id = canonical_factor_agreements.factor_profile_id
                     AND fp.operating_company_id = canonical_factor_agreements.operating_company_id)));
END $$;

-- ── PHASE 5: the column never comes back ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _system.refuse_tenant_id_column()
RETURNS event_trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  r record; v_rel regclass; v_pol record;
  -- CC-2's double-scoped tables (ROUND 342 phase 2): they still carry the legacy column until phase 2 drops it.
  -- Shrink-only. When a table loses the column it simply stops matching; remove its name in the same PR.
  LEGACY text[] := ARRAY[
    'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
    'factoring.letter_of_release', 'factoring.reserve_movement',
    'insurance.claim', 'insurance.coi_request', 'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy',
    'insurance.policy_unit', 'insurance.refund_obligation', 'maintenance.internal_labor_log',
    'master_data.customer_terms_history', 'mdata.mx_permits', 'mdata.mx_tolls_ledger'
  ];
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF r.classid = 'pg_class'::regclass AND r.objid IS NOT NULL THEN
      v_rel := r.objid::regclass;
      IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                  WHERE a.attrelid = r.objid AND a.attname = 'tenant_id' AND NOT a.attisdropped AND a.attnum > 0
                    AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))
         AND NOT (v_rel::text = ANY (LEGACY)) THEN
        RAISE EXCEPTION 'ROUND 342: % carries a column named tenant_id. operating_company_id is the one entity column — name it operating_company_id (uuid REFERENCES org.companies(id)).', v_rel
          USING ERRCODE = 'feature_not_supported';
      END IF;
    ELSIF r.classid = 'pg_policy'::regclass AND r.objid IS NOT NULL THEN
      SELECT p.polname, p.polrelid::regclass AS rel,
             COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') AS expr
        INTO v_pol FROM pg_policy p WHERE p.oid = r.objid;
      IF v_pol.expr ~ '\mtenant_id\M' AND NOT (v_pol.rel::text = ANY (LEGACY)) THEN
        RAISE EXCEPTION 'ROUND 342: policy % on % reads tenant_id. Scope on operating_company_id, the one entity column.', v_pol.polname, v_pol.rel
          USING ERRCODE = 'feature_not_supported';
      END IF;
    END IF;
  END LOOP;
END $fn$;

DROP EVENT TRIGGER IF EXISTS trg_refuse_tenant_id_column;
CREATE EVENT TRIGGER trg_refuse_tenant_id_column ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE', 'CREATE VIEW', 'ALTER VIEW',
               'CREATE MATERIALIZED VIEW', 'CREATE FOREIGN TABLE', 'CREATE POLICY', 'ALTER POLICY')
  EXECUTE FUNCTION _system.refuse_tenant_id_column();

-- ── self-check ──────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_cols bigint; n_pol bigint; n_fk bigint; v_tc text;
BEGIN
  SELECT count(*) INTO n_cols FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE a.attname = 'tenant_id' AND NOT a.attisdropped AND a.attnum > 0 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND NOT (format('%I.%I', n.nspname, c.relname) = ANY (ARRAY[
       'factoring.bank_match_suggestion', 'factoring.batch', 'factoring.customer_factor_assignment', 'factoring.factor',
       'factoring.letter_of_release', 'factoring.reserve_movement', 'insurance.claim', 'insurance.coi_request',
       'insurance.lawsuit', 'insurance.payment_schedule', 'insurance.policy', 'insurance.policy_unit',
       'insurance.refund_obligation', 'maintenance.internal_labor_log', 'master_data.customer_terms_history',
       'mdata.mx_permits', 'mdata.mx_tolls_ledger']));
  IF n_cols <> 0 THEN
    RAISE EXCEPTION '202615330400: % relation(s) outside CC-2''s legacy set still carry tenant_id', n_cols;
  END IF;
  IF to_regclass('factoring.canonical_factor_agreements') IS NOT NULL THEN
    SELECT count(*) INTO n_fk FROM pg_constraint
     WHERE conrelid = 'factoring.canonical_factor_agreements'::regclass AND contype = 'f'
       AND conname IN ('canonical_factor_agreements_profile_same_entity_fkey', 'canonical_factor_agreements_vendor_same_entity_fkey')
       AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (operating_company_id, %';
    IF n_fk <> 2 THEN
      RAISE EXCEPTION '202615330400: the two same-entity composite FKs did not survive on operating_company_id (found %)', n_fk;
    END IF;
    SELECT count(*) INTO n_pol FROM pg_policy WHERE polrelid = 'factoring.canonical_factor_agreements'::regclass
       AND (COALESCE(pg_get_expr(polqual, polrelid), '') || COALESCE(pg_get_expr(polwithcheck, polrelid), '')) ~ '\mtenant_id\M|fp\.\w+ = fp\.';
    IF n_pol <> 0 THEN
      RAISE EXCEPTION '202615330400: % canonical_factor_agreements policy(ies) still read tenant_id or compare fp to itself', n_pol;
    END IF;
  END IF;
  IF to_regclass('insurance.type_catalog') IS NOT NULL THEN
    SELECT pg_get_expr(polqual, polrelid) INTO v_tc FROM pg_policy WHERE polrelid = 'insurance.type_catalog'::regclass AND polname = 'insurance_type_catalog_shared_rw';
    IF v_tc IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION '202615330400: insurance.type_catalog policy is no longer USING (true) — it is a shared catalog, never scope it (got %)', v_tc;
    END IF;
  END IF;
END $$;
COMMIT;
