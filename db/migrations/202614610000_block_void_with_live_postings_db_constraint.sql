-- DEFECT 282.1 (Lead order, 2026-09-30) — "a row may not carry voided_at while live postings
-- reference it... A raw UPDATE must FAIL at the database." Root-caused live this round: 781 USMCA
-- accounting.expenses rows are voided but still carry a live (unreversed) journal_entry_postings
-- link, $79,899.34 -- because at least one application code path sets voided_at directly without
-- always reversing the posting first (see docs/bus/09-30-2026-CC-1-281-1-VOIDED-AT-WRITER-
-- ENUMERATION.md, 35 raw writer call-sites). Application-code discipline alone cannot close this;
-- the same class of bug (a writer that sets voided_at on one path but skips the reversal on
-- another) can always recur. This migration adds the missing DATABASE-level backstop.
--
-- DESIGN: one reusable trigger function, applied per voidable table via a per-table trigger that
-- passes the table's own journal_entry_postings.source_transaction_type string as TG_ARGV[0] (this
-- varies by table -- confirmed live: accounting.expenses='expense',
-- fuel.fuel_transactions='fuel_event' (NOT 'fuel_transaction'), accounting.factoring_advances=
-- 'factoring_advance', accounting.invoices='invoice', accounting.bills='bill',
-- accounting.payments='customer_payment' (NOT 'payment')). Fires only when voided_at transitions
-- from NULL to NOT NULL (an INSERT already carrying voided_at also checked, for completeness).
-- Liveness check is the SAME discriminator this session established as correct everywhere else in
-- this codebase (fuel guard rewrite, ACCT-F2026093008/9, DEFECT 3 AUTH-138): a posting's own
-- journal_entry must be status='posted' AND voided_at IS NULL AND reversed_by_je_id IS NULL AND
-- reverses_je_id IS NULL to count as a live "still needs reversing" claim -- a REVERSAL's own
-- posting keeps the SAME source_transaction_type/source_transaction_id as the original it reverses
-- (confirmed live: reversePostedSourceTransactionInClientTx's reversal for expense
-- 8f4c66f1-... carries source_transaction_type='expense', reverses_je_id set) and must NOT be
-- counted as "still live and unreversed", or every correctly-voided-and-reversed document would
-- trip this constraint forever.
--
-- CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED, checked at COMMIT (not per-statement): the
-- correct application pattern (reverse the posting, THEN set voided_at, both in one transaction --
-- exactly what expenses.routes.ts's /:expenseId/void route and every ops script this session used
-- already do) still succeeds, because by commit time the reversal already exists and the check
-- passes. Only a transaction that ends with voided_at set and NO live-excluding reversal posted
-- fails -- exactly the raw-UPDATE bypass this defect names. Idempotent: DROP TRIGGER IF EXISTS +
-- CREATE, safe to re-run.
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION accounting.fn_block_void_with_live_postings()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $BODY$
  DECLARE
    v_source_type text := TG_ARGV[0];
    v_live_count int;
  BEGIN
    IF NEW.voided_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.voided_at IS NOT NULL THEN
      -- already voided before this statement; nothing new to check
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_live_count
      FROM accounting.journal_entry_postings jep
      JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
     WHERE jep.source_transaction_type = v_source_type
       AND jep.source_transaction_id = NEW.id::text
       AND je.status = 'posted'
       AND je.voided_at IS NULL
       AND je.reversed_by_je_id IS NULL
       AND je.reverses_je_id IS NULL;

    IF v_live_count > 0 THEN
      RAISE EXCEPTION
        'BLOCKED (282.1): % row % has voided_at set but % live, unreversed journal_entry_posting(s) (source_transaction_type=%) still reference it. Reverse the posting BEFORE (or in the same transaction as, before commit) setting voided_at.',
        TG_TABLE_NAME, NEW.id, v_live_count, v_source_type;
    END IF;

    RETURN NEW;
  END;
  $BODY$;
END $$;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('accounting', 'expenses', 'expense'),
      ('accounting', 'invoices', 'invoice'),
      ('accounting', 'bills', 'bill'),
      ('accounting', 'payments', 'customer_payment'),
      ('accounting', 'factoring_advances', 'factoring_advance'),
      ('fuel', 'fuel_transactions', 'fuel_event')
    ) AS x(schema_name, table_name, source_type)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_block_void_with_live_postings ON %I.%I', t.schema_name, t.table_name);
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER trg_block_void_with_live_postings
         AFTER INSERT OR UPDATE OF voided_at ON %I.%I
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW
         EXECUTE FUNCTION accounting.fn_block_void_with_live_postings(%L)',
      t.schema_name, t.table_name, t.source_type
    );
  END LOOP;
END $$;
