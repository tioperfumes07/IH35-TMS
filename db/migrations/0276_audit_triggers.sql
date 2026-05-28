BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.row_changes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  row_pk TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_user_id UUID,
  changed_by_role TEXT,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_row_changes_table
  ON audit.row_changes (schema_name, table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_row_changes_tenant
  ON audit.row_changes (tenant_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_row_changes_row_pk
  ON audit.row_changes (schema_name, table_name, row_pk);

ALTER TABLE audit.row_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.row_changes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_row_changes_tenant_scope ON audit.row_changes;
CREATE POLICY audit_row_changes_tenant_scope
  ON audit.row_changes
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

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

  v_tenant_text := v_source->>'tenant_id';
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

CREATE OR REPLACE FUNCTION audit.ensure_row_trigger(target_schema text, target_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = target_schema
      AND c.relname = target_table
  ) THEN
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      'trg_audit_' || target_table,
      target_schema,
      target_table
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
      'trg_audit_' || target_table,
      target_schema,
      target_table
    );
  END IF;
END;
$$;

SELECT audit.ensure_row_trigger('mdata', 'bills');
SELECT audit.ensure_row_trigger('mdata', 'bill_lines');
SELECT audit.ensure_row_trigger('mdata', 'bill_payments');
SELECT audit.ensure_row_trigger('mdata', 'work_orders');
SELECT audit.ensure_row_trigger('mdata', 'work_order_lines');
SELECT audit.ensure_row_trigger('maintenance', 'work_orders');
SELECT audit.ensure_row_trigger('maintenance', 'work_order_lines');
SELECT audit.ensure_row_trigger('maint', 'part');
SELECT audit.ensure_row_trigger('maint', 'pm_schedule');
SELECT audit.ensure_row_trigger('mdata', 'fuel_entries');
SELECT audit.ensure_row_trigger('dispatch', 'loads');
SELECT audit.ensure_row_trigger('dispatch', 'load_status_history');
SELECT audit.ensure_row_trigger('mdata', 'loads');
SELECT audit.ensure_row_trigger('mdata', 'load_status_history');
SELECT audit.ensure_row_trigger('accounting', 'bank_transactions');
SELECT audit.ensure_row_trigger('banking', 'bank_transactions');
SELECT audit.ensure_row_trigger('accounting', 'journal_entries');
SELECT audit.ensure_row_trigger('insurance', 'policy');
SELECT audit.ensure_row_trigger('insurance', 'policy_covered_unit');
SELECT audit.ensure_row_trigger('insurance', 'policy_claim_link');
SELECT audit.ensure_row_trigger('accounting', 'bills');
SELECT audit.ensure_row_trigger('accounting', 'bill_lines');
SELECT audit.ensure_row_trigger('accounting', 'bill_payments');
SELECT audit.ensure_row_trigger('accounting', 'invoices');

GRANT USAGE ON SCHEMA audit TO ih35_app;
GRANT SELECT ON audit.row_changes TO ih35_app;

COMMIT;
