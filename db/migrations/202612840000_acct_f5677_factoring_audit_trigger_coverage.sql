-- ACCT-F5677 — extends LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER to the `factoring` schema. The
-- board's prior measurements (commit 83cec4b45, then migration 202612770000's 55-table sweep)
-- scoped only accounting/banking/driver_finance (134 tables); `factoring` was never in that
-- baseline and was never checked.
--
-- MEASURED ON PROD (Neon project tiny-field-89581227) 2026-08-21, RLS-bypassed
-- (SELECT set_config('app.bypass_rls','lucia',true), own statement, current_user asserted) —
-- identical methodology to 83cec4b45 / 202612770000: every base table in `factoring` LEFT JOINed
-- against pg_trigger rows named ILIKE '%audit%', filtered to NULL (no audit trigger at all):
--
--   factoring (6): bank_match_suggestion, batch, canonical_factor_agreements,
--     customer_factor_assignment, factor, letter_of_release
--
-- `factoring.batch` alone carries three cents columns (expected_advance_cents,
-- expected_fee_cents, total_face_cents); the rest are the reference/assignment tables the money
-- flow is keyed against (which factor a customer is assigned to, which agreement governs a
-- batch) — equally audit-relevant under the same WORM standard already applied to
-- accounting/banking/driver_finance.
--
-- `audit.tg_audit_row()` is schema-agnostic (SECURITY DEFINER, derives tenant from whichever
-- scoping column the row has via to_jsonb, falls back to md5(row) for a PK when neither `id` nor
-- `uuid` is present) — the SAME reused function every prior audit-trigger attach migration uses,
-- no new audit logic here.
--
-- IDEMPOTENT: each trigger is created only when absent (NOT EXISTS against pg_trigger/pg_proc),
-- so a re-run is a no-op and this replays safely on a branch or a fresh CI database. Skips
-- silently when a listed table does not exist on a given DB.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('factoring', 'bank_match_suggestion'),
      ('factoring', 'batch'),
      ('factoring', 'canonical_factor_agreements'),
      ('factoring', 'customer_factor_assignment'),
      ('factoring', 'factor'),
      ('factoring', 'letter_of_release')
    ) AS t(schema_name, table_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = r.schema_name AND c.relname = r.table_name AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = r.schema_name AND c.relname = r.table_name
         AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER tg_audit_row_%s AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
        r.table_name, r.schema_name, r.table_name
      );
      RAISE NOTICE 'ACCT-F5677: audit trigger attached to %.%', r.schema_name, r.table_name;
    END IF;
  END LOOP;
END
$$;

COMMIT;
