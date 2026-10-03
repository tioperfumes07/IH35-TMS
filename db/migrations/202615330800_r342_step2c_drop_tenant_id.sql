-- 202615330800_r342_step2c_drop_tenant_id.sql
-- ROUND 342 phase 2, step 2c (CC-2). One entity column: operating_company_id. CC-1's 202615330400 renamed the 17
-- tenant-only tables, dropped the coi sync trigger and moved the factor-agreement FKs to operating_company_id; the
-- application stopped reading and writing tenant_id in the Phase A PR (deployed before this file). This drops the column
-- from the 17 double-scoped tables, so the second company column — and the four CHECKs that taped the two together —
-- can never disagree again.
--   1. factoring.v_factor_reserve_balance re-reads operating_company_id (same output columns, security_invoker kept).
--   2. The four CHECK (operating_company_id = tenant_id) constraints are dropped (the column they compare goes).
--   3. DROP COLUMN tenant_id on all 17, RESTRICT (no CASCADE): an unexpected dependency fails the migration loudly.
--      The tenant_id unique keys and FKs go with the column; every one already has its operating_company_id twin
--      (measured 2026-10-03: batch, factor, claim, lawsuit, policy_unit, refund_obligation).
--   4. CC-1's guards shrink to zero, as their own comments ask: the event trigger's LEGACY allow-list is emptied (and
--      the trigger re-armed on it), and audit.tg_audit_row stops reading the tenant_id fallback key.
-- Idempotent: DROP ... IF EXISTS throughout; the function bodies are CREATE OR REPLACE.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trg_refuse_tenant_id_column') THEN
    RAISE EXCEPTION '202615330800: CC-1''s 202615330400 (event trigger trg_refuse_tenant_id_column) is not applied — step 2c runs after it';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coi_request_sync_operating_company_id') THEN
    RAISE EXCEPTION '202615330800: the coi sync trigger still exists — 202615330400 must drop it first';
  END IF;
END $$;

-- 1. The view reads the canonical column.
CREATE OR REPLACE VIEW factoring.v_factor_reserve_balance WITH (security_invoker = true) AS
 SELECT operating_company_id,
    factor_id,
    (COALESCE(sum(
        CASE
            WHEN (direction = 'credit'::text) THEN amount_cents
            WHEN (direction = 'debit'::text) THEN (amount_cents * '-1'::integer)
            ELSE (0)::bigint
        END), (0)::numeric))::bigint AS balance_cents,
    max(created_at) AS last_movement_at,
    count(*) AS movement_count
   FROM factoring.reserve_movement
  GROUP BY operating_company_id, factor_id;

-- 2. The equality CHECKs.
ALTER TABLE maintenance.internal_labor_log DROP CONSTRAINT IF EXISTS internal_labor_log_check;
ALTER TABLE master_data.customer_terms_history DROP CONSTRAINT IF EXISTS customer_terms_history_check;
ALTER TABLE mdata.mx_permits DROP CONSTRAINT IF EXISTS mx_permits_check;
ALTER TABLE mdata.mx_tolls_ledger DROP CONSTRAINT IF EXISTS mx_tolls_ledger_check;

-- 3. The column.
ALTER TABLE factoring.bank_match_suggestion DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE factoring.batch DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE factoring.customer_factor_assignment DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE factoring.factor DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE factoring.letter_of_release DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE factoring.reserve_movement DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.claim DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.coi_request DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.lawsuit DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.payment_schedule DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.policy DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.policy_unit DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE insurance.refund_obligation DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE maintenance.internal_labor_log DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE master_data.customer_terms_history DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE mdata.mx_permits DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE mdata.mx_tolls_ledger DROP COLUMN IF EXISTS tenant_id;

-- 4a. Audit writer: no tenant_id fallback.
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

  -- ROUND 342: operating_company_id is the canonical company column. Phase 2 step 2c (202615330800) dropped the last
  -- legacy company column, so its fallback key is gone.
  v_company_text := COALESCE(
    v_source->>'operating_company_id',
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

-- 4b. Event trigger: the legacy allow-list is empty.
CREATE OR REPLACE FUNCTION _system.refuse_tenant_id_column()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r record; v_rel regclass; v_pol record;
  -- ROUND 342 phase 2 complete: the legacy allow-list is empty.
  LEGACY text[] := ARRAY[]::text[];  -- emptied by 202615330800 (CC-2 step 2c): no table may carry tenant_id
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
END $function$;

-- 4c. Re-arm the event trigger on the updated function (verify-one-entity-column RULE 5: the last migration touching it
--     re-creates it). Same tags as 202615330400.
DROP EVENT TRIGGER IF EXISTS trg_refuse_tenant_id_column;
CREATE EVENT TRIGGER trg_refuse_tenant_id_column ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE', 'CREATE VIEW', 'ALTER VIEW',
               'CREATE MATERIALIZED VIEW', 'CREATE FOREIGN TABLE', 'CREATE POLICY', 'ALTER POLICY')
  EXECUTE FUNCTION _system.refuse_tenant_id_column();

-- Post-conditions.
DO $$
DECLARE v_left text;
BEGIN
  SELECT string_agg(table_schema || '.' || table_name, ', ') INTO v_left
    FROM information_schema.columns
   WHERE column_name = 'tenant_id' AND table_schema NOT IN ('pg_catalog', 'information_schema');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION '202615330800: tenant_id still present on %', v_left;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trg_refuse_tenant_id_column' AND evtenabled <> 'D') THEN
    RAISE EXCEPTION '202615330800: event trigger trg_refuse_tenant_id_column is not armed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'audit.tg_audit_row'::regproc AND prosrc ~ 'tenant_id') THEN
    RAISE EXCEPTION '202615330800: audit.tg_audit_row still reads tenant_id';
  END IF;
END $$;

COMMIT;
