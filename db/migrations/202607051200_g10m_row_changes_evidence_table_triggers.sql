-- G10-M (item 2 of 7) — audit.row_changes mutation-trigger coverage for legal-evidence tables.
--
-- FINDING: the shared row-mutation audit trigger (audit.tg_audit_row via audit.ensure_row_trigger,
-- migration 0276) was attached to the financial/maintenance/dispatch tables but NOT to several
-- legal-evidence master/operational tables. So an INSERT/UPDATE/DELETE on a driver, unit, trailer,
-- load stop, customer, or vendor left NO row in audit.row_changes — a gap in the tamper-evident
-- who-changed-what record for exactly the rows a Ch.11 examiner / DOT audit would ask about.
--
-- This migration is PURELY additive and idempotent:
--   1) CREATE OR REPLACE audit.tg_audit_row() — identical to 0276 EXCEPT the tenant resolution now
--      falls back operating_company_id -> owner_company_id -> default_company_id -> company_id when a
--      row has no `tenant_id` column. Without this, mdata rows (which scope by operating_company_id /
--      owner_company_id, not tenant_id) would land with tenant_id = NULL and be invisible to the
--      tenant-scoped audit-history UI. Strictly additive: it only fills a tenant_id that was NULL; it
--      never overwrites an existing tenant_id and changes NO other behaviour, so every existing trigger
--      (financial tables included) keeps working byte-for-byte and simply resolves tenant more often.
--   2) audit.ensure_row_trigger(...) on the evidence tables. ensure_row_trigger is existence-guarded
--      (no-op if the table is absent) and DROP-IF-EXISTS + CREATE, so re-running is safe.
--
-- Writes NO money, posts NO GL, flips NO flag. Touches mdata.* schema (trigger attach) + the shared
-- audit function -> financial-cluster gated: DO NOT self-merge. Jorge reviews the full SQL, then merges
-- (preDeploy db:migrate applies it). Idempotent CREATE-only; fresh-DB CI validates it.

BEGIN;

CREATE OR REPLACE FUNCTION audit.tg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, audit
AS $$
DECLARE
  v_source jsonb;
  v_tenant_text text;
  v_user_text text;
  v_tenant_id uuid;
  v_changed_by_user uuid;
  v_pk text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_source := to_jsonb(OLD);
  ELSE
    v_source := to_jsonb(NEW);
  END IF;

  -- G10-M: resolve the tenant from whichever company-scoping column the table actually carries.
  -- Order: explicit tenant_id first, then the mdata/asset variants. First UUID-shaped hit wins.
  v_tenant_text := COALESCE(
    v_source->>'tenant_id',
    v_source->>'operating_company_id',
    v_source->>'owner_company_id',
    v_source->>'default_company_id',
    v_source->>'company_id'
  );
  IF v_tenant_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_tenant_id := v_tenant_text::uuid;
  END IF;

  v_user_text := NULLIF(current_setting('app.user_id', true), '');
  IF v_user_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_changed_by_user := v_user_text::uuid;
  END IF;

  v_pk := COALESCE(v_source->>'id', v_source->>'uuid', md5(v_source::text));

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit.row_changes (
      tenant_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
    ) VALUES (
      v_tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'DELETE', v_pk, to_jsonb(OLD), NULL, v_changed_by_user,
      NULLIF(current_setting('app.user_role', true), ''),
      NULLIF(current_setting('app.session_id', true), '')
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit.row_changes (
      tenant_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
    ) VALUES (
      v_tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'UPDATE', v_pk, to_jsonb(OLD), to_jsonb(NEW), v_changed_by_user,
      NULLIF(current_setting('app.user_role', true), ''),
      NULLIF(current_setting('app.session_id', true), '')
    );
    RETURN NEW;
  END IF;

  INSERT INTO audit.row_changes (
    tenant_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
  ) VALUES (
    v_tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'INSERT', v_pk, NULL, to_jsonb(NEW), v_changed_by_user,
    NULLIF(current_setting('app.user_role', true), ''),
    NULLIF(current_setting('app.session_id', true), '')
  );
  RETURN NEW;
END;
$$;

-- Attach the mutation trigger to the legal-evidence tables that lacked it. ensure_row_trigger()
-- (0276) is existence-guarded + DROP/CREATE, so every line is idempotent and a missing table is a no-op.
SELECT audit.ensure_row_trigger('mdata', 'load_stops');               -- POD/BOL evidence, never-delete + CASCADE children
SELECT audit.ensure_row_trigger('mdata', 'drivers');                  -- driver-qualification legal file
SELECT audit.ensure_row_trigger('mdata', 'units');                    -- tractor ownership/registration record
SELECT audit.ensure_row_trigger('mdata', 'equipment');               -- trailer/equipment record
SELECT audit.ensure_row_trigger('mdata', 'customers');               -- customer master (A/R subject)
SELECT audit.ensure_row_trigger('mdata', 'vendors');                 -- vendor master (A/P subject)
SELECT audit.ensure_row_trigger('dispatch', 'load_assignment_history'); -- driver/trailer assignment evidence

COMMIT;
