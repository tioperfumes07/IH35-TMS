-- CLS-FINANCIAL-TABLE-DELETABLE / ACCT-F137 — WORM sweep #2: the four highest-volume financial
-- tables that still grant DELETE and have no soft-delete column.
--
-- ONE MIGRATION, FOUR TABLES, because this is one root cause at four sites (§9.0.17): the app role can
-- DELETE financial rows. Splitting it into four PRs would be four rehearsals of the same trigger.
--
-- WHAT PROD SAYS (2026-08-05, lucia). The capability is not theoretical on these:
--     accounting.bill_lines           155,274 rows   n_tup_del = 44   soft-delete columns: 0
--     accounting.expense_lines         33,980 rows   n_tup_del =  0   soft-delete columns: 0
--     accounting.payment_applications  12,207 rows   n_tup_del =  0   soft-delete columns: 0
--     accounting.bill_payments          6,544 rows   n_tup_del =  0   soft-delete columns: 0
--
-- bill_lines is the find here: FORTY-FOUR rows already deleted from the largest financial line table
-- in the system, with no soft-delete column and therefore no way to know what they were. That is the
-- same shape as driver_finance.driver_settlements (7 deleted, ACCT-F130) — the difference is only
-- that nobody had looked at this one yet. The other three are unexercised, which is luck, not control.
--
-- NO SOFT-DELETE COLUMNS ADDED, per VOID LAW. Correction on a line is not a per-line void — it is
-- voiding or reversing the PARENT document (bill, invoice, payment), which keeps the document's totals
-- and the ledger's DR = CR intact. A voided_at on a line would invite someone to void one line of a
-- balanced document and silently break it, exactly as it would on journal_entry_postings (ACCT-F131).
-- So the control is uniform: DELETE becomes impossible; correction stays at the document level.
--
-- SCOPED TO THE APPLICATION ROLE, and this is a correction learned the hard way. My first WORM trigger
-- refused EVERY caller — stricter on paper, and it turned 21 integration-test teardowns red, which
-- creates immediate pressure to weaken the trigger. That is how a WORM control dies. What must be
-- impossible is a DELETE from the APPLICATION: production runs as ih35_app, the same role the REVOKE
-- targets, and the trigger makes that refusal TABLE-bound so a future GRANT cannot silently re-open
-- it. A DBA or test harness on another role can still clean up.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS + catalogue-guarded. No data is written and
-- no row is modified — this only removes a capability.

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF current_user <> 'ih35_app' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused by the application role. Financial rows are never deleted — void or reverse the PARENT document instead, which preserves the document total and the ledger balance.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$fn$;

DO $$
DECLARE
  v_tbl text;
  v_trg text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'accounting.bill_lines',
    'accounting.expense_lines',
    'accounting.payment_applications',
    'accounting.bill_payments'
  ] LOOP
    IF to_regclass(v_tbl) IS NULL THEN
      RAISE NOTICE 'ACCT-F137: % absent — skipping', v_tbl;
      CONTINUE;
    END IF;

    v_trg := 'trg_' || split_part(v_tbl, '.', 2) || '_no_delete';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_trg, v_tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      v_trg, v_tbl
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', v_tbl);
    RAISE NOTICE 'ACCT-F137: % is now WORM (trigger + REVOKE DELETE)', v_tbl;
  END LOOP;
END
$$;
