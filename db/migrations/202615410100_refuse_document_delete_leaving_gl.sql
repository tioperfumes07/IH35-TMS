-- 202615410100_refuse_document_delete_leaving_gl.sql
-- CC-1 · ROUND 390 (a)/(b) — a financial document is NEVER removed out from under its GL (Lead, 2026-10-04).
--
-- ROOT CAUSE (measured live on prod, AUTH-397-UNWIND): 60 of the 61 double-reversal originals have NO expense record —
-- not voided, not soft-deleted, GONE — while their journal entries stayed live and still held $2,976.63 on A/P 2000 /
-- 9000 Ask My Accountant. The delete path removed the document and LEFT THE GL; the void engine then re-reversed the
-- orphans (ACCT-F397). Nothing in the database said a document and the posting lines naming it must leave together.
--
-- THE RULE, enforced here at COMMIT: a transaction that deletes a row of a document table while any
-- accounting.journal_entry_postings line still names that row (source_transaction_type in the table's types,
-- source_transaction_id = the row's id) is refused. Deferred, so the delete ORDER inside the transaction does not
-- matter: removing the entries first or the document first both pass when both go; removing only the document fails.
-- "Reverse first" (a) is already the WORM arm's rule (documents only once voided); the purge engine also refuses live
-- GL in its plan (scripts/lib/orphan-gl.mjs). The message names the live (unreversed) count so the cause is obvious.
--
-- SECURITY DEFINER, owned by the migration role (BYPASSRLS on prod): the check must see every posting line regardless of
-- the deleting session's company GUC — under ih35_app's FORCE RLS a line of another company would be invisible and the
-- check would pass by not looking. search_path pinned. The function reads only; it writes nothing.
-- The table -> types map is the one in scripts/lib/orphan-gl.mjs (verify-no-orphaned-gl checks they agree).
-- Additive, idempotent. No data is changed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION accounting.refuse_document_delete_leaving_gl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_opco  uuid := NULLIF(to_jsonb(OLD) ->> 'operating_company_id', '')::uuid;
  v_lines int;
  v_live  int;
BEGIN
  SELECT count(*)::int,
         count(*) FILTER (WHERE p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL)::int
    INTO v_lines, v_live
    FROM accounting.journal_entry_postings p
   WHERE (v_opco IS NULL OR p.operating_company_id = v_opco)
     AND p.source_transaction_type = ANY (TG_ARGV::text[])
     AND p.source_transaction_id = OLD.id::text;
  IF v_lines > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('IH35_DOCUMENT_DELETE_LEAVES_GL %s %s: %s posting line(s) still name this document (%s live, unreversed)',
                       TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, OLD.id, v_lines, v_live),
      HINT = 'Reverse (void) the document, then remove its journal entries in the same transaction. A document is never removed out from under its GL (ROUND 390).';
  END IF;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION accounting.refuse_document_delete_leaving_gl() FROM PUBLIC;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('accounting.expenses',               ARRAY['expense']),
      ('accounting.invoices',               ARRAY['invoice']),
      ('accounting.bills',                  ARRAY['bill']),
      ('accounting.bill_payments',          ARRAY['bill_payment']),
      ('accounting.payments',               ARRAY['payment', 'customer_payment']),
      ('driver_finance.driver_settlements', ARRAY['driver_settlement']),
      ('mdata.loads',                       ARRAY['load']),
      ('accounting.factoring_advances',     ARRAY['factoring_advance'])
    ) AS v(tbl, types)
  LOOP
    IF to_regclass(r.tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_refuse_document_delete_leaving_gl ON %s', r.tbl);
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER trg_refuse_document_delete_leaving_gl AFTER DELETE ON %s '
      'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting.refuse_document_delete_leaving_gl(%s)',
      r.tbl, (SELECT string_agg(quote_literal(t), ', ') FROM unnest(r.types) t));
  END LOOP;
END $$;

COMMIT;
