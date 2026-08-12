-- LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER — closing the last 2 named-and-still-uncovered tables.
--
-- ACCT-F261 (202612420000) attached audit.tg_audit_row to every accounting/driver_finance/banking/
-- factoring table carrying a money COLUMN (a pattern match on `(amount|total|balance)_cents$` or
-- `debit_or_credit`). accounting.posting_batches and accounting.transaction_source_links correctly
-- fell outside that detector — neither holds a dollar amount of its own — but both are still
-- financial-evidence tables the original finding named by name:
--
--   "transaction_source_links being unaudited means a re-pointed both-way link is invisible too"
--
-- MEASURED LIVE on prod (tiny-field-89581227, bypass_rls=lucia, 2026-08-12):
--   accounting.posting_batches            15,000 live rows, 27,595 UPDATEs, 0 audit rows ever
--   accounting.transaction_source_links     3,856 live rows,      0 UPDATEs, 0 audit rows ever
--
-- posting_batches is the more urgent of the two: its `batch_status` column is the state machine a
-- money document's posting lifecycle runs through (pending -> posted / failed / retried), and every
-- one of its 27,595 transitions today leaves no before-image. transaction_source_links has not been
-- mutated yet (insert-only so far), but the same class of gap applies the moment a link is
-- re-pointed — this migration closes it before that happens, not after.
--
-- SAME MECHANISM AS THE EXISTING COVERAGE, deliberately not reinvented: audit.tg_audit_row() already
-- exists (ACCT-F178, 202612350000) and is already attached to 11 of the schema's tables including
-- both tables' closest siblings (journal_entry_postings, bills). This migration attaches the SAME
-- function to these 2 remaining named tables — no new audit machinery, no new column.
--
-- Additive and idempotent: NOT EXISTS guards mean a re-run attaches nothing twice.

DO $$
BEGIN
  IF to_regprocedure('audit.tg_audit_row()') IS NULL THEN
    RAISE EXCEPTION 'LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER: audit.tg_audit_row() is absent — 202612350000 must be applied first';
  END IF;

  IF to_regclass('accounting.posting_batches') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'accounting.posting_batches'::regclass
          AND t.tgname = 'tg_audit_row_posting_batches'
          AND NOT t.tgisinternal
     )
  THEN
    CREATE TRIGGER tg_audit_row_posting_batches
      AFTER INSERT OR UPDATE OR DELETE ON accounting.posting_batches
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;

  IF to_regclass('accounting.transaction_source_links') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'accounting.transaction_source_links'::regclass
          AND t.tgname = 'tg_audit_row_transaction_source_links'
          AND NOT t.tgisinternal
     )
  THEN
    CREATE TRIGGER tg_audit_row_transaction_source_links
      AFTER INSERT OR UPDATE OR DELETE ON accounting.transaction_source_links
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;
END
$$;
