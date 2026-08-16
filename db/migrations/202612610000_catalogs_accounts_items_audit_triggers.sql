-- LV-COA-AND-ITEMS-UNAUDITED — the Chart of Accounts and the three catalogs it shares a WORM
-- expectation with carry NO audit trigger at all.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-15 (RLS-bypassed, RESET ROLE as its own
-- statement, from pg_trigger / pg_proc):
--
--   catalogs.accounts        -> ZERO audit triggers
--   catalogs.items           -> ZERO audit triggers
--   catalogs.payment_terms   -> ZERO audit triggers
--   catalogs.classes         -> ZERO audit triggers
--
-- These four are the reference spine every posting, bill, invoice and JE line resolves through
-- (account role, item -> GL mapping, terms -> due-date math, class -> segment). 202612350000
-- (ACCT-F178) already extended `audit.tg_audit_row` to every money-column-bearing table in
-- accounting / driver_finance / banking / factoring by PREDICATE — but its predicate requires an
-- `amount_cents`/`total_cents`/`balance_cents`/`debit_or_credit` column, and none of these four
-- catalog tables carry one (they are reference rows, not money lines), so that migration's
-- predicate correctly never reached them. That is a distinct, still-open gap: an account's role
-- can be silently reassigned, an item's GL mapping silently repointed, terms/class definitions
-- silently edited — all with zero row in `audit.row_changes`, and no trace of who or when.
--
-- WHY AN EXPLICIT LIST HERE INSTEAD OF A PREDICATE: unlike 202612350000's money-column predicate,
-- there is no single structural marker shared by "the reference tables every poster resolves
-- through" versus catalogs' other tables (e.g. `catalogs.vendor_types`, which are lower-stakes
-- free-form lookups). Rather than invent a fragile marker, this migration names the exact four
-- tables the finding identified; a future catalogs table earning the same protection gets its own
-- named migration, same as 202612350000 documents doing for its own scope.
--
-- `audit.tg_audit_row()` is schema-agnostic (SECURITY DEFINER, derives tenant from whichever
-- scoping column the row has via to_jsonb, falls back to md5(row) for a PK when neither `id` nor
-- `uuid` is present) — no new audit logic is written here, same reused function as ACCT-F178.
--
-- IDEMPOTENT: each trigger is created only when absent (NOT EXISTS against pg_trigger/pg_proc), so
-- a re-run is a no-op and this replays safely on a branch or a fresh CI database.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('catalogs', 'accounts'),
      ('catalogs', 'items'),
      ('catalogs', 'payment_terms'),
      ('catalogs', 'classes')
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
      RAISE NOTICE 'LV-COA-AND-ITEMS-UNAUDITED: audit trigger attached to %.%', r.schema_name, r.table_name;
    END IF;
  END LOOP;
END
$$;

COMMIT;
