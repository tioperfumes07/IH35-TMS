-- CLS-FINANCIAL-TABLE-DELETABLE / ACCT-F131 — make DELETE structurally impossible on the GL's own
-- line table, accounting.journal_entry_postings.
--
-- WHY THIS TABLE IS PRIORITY 1. Prod 2026-08-05: 3,605 posting lines carrying the entire trial
-- balance (DR = CR = $11,638,837.72). `ih35_app` holds DELETE on it and it has NO soft-delete column.
-- A single DELETE of one line silently unbalances the general ledger: the journal entry it belonged
-- to no longer nets to zero, no reversing entry exists to explain it, and nothing anywhere records
-- that a line was ever there. The balanced-ledger audit would report drift with no way to reconstruct
-- the cause. n_tup_del is 0 today — the capability is unused HERE, but it is the same capability that
-- removed 7 rows from driver_finance.driver_settlements (ACCT-F130), so "unused" is luck, not a
-- control.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: it does NOT add voided_at / void_reason /
-- voided_by_user_id, even though the sibling migration for driver_settlements did exactly that. On a
-- GL LINE those columns would be actively wrong, and applying the recipe mechanically would have
-- introduced a defect:
--   * A journal entry must balance. Voiding ONE line of a balanced entry leaves DR <> CR — the void
--     column would hand someone a supported-looking way to break the ledger.
--   * The correction mechanism for a posting already exists in this very table:
--     reversal_of_line_id and reversed_by_line_id. GL correction is a REVERSING ENTRY, which
--     preserves both the original and the correction — the QuickBooks / NetSuite discipline and the
--     stricter of the two.
--   Adding a second, competing correction path would make the ledger's history ambiguous. So the fix
--   here is only: DELETE becomes impossible, and correction stays reversal-only.
--
-- WHY A TRIGGER AS WELL AS A REVOKE. A REVOKE binds one role and is silently undone by the next GRANT
-- or a superuser session. The trigger binds the TABLE, so DELETE fails for every caller regardless of
-- grants — the difference between a guarantee and a convention.
--
-- CASCADE NOTE (verified, and the reason this is safe): journal_entry_postings.journal_entry_uuid
-- references accounting.journal_entries ON DELETE CASCADE. A row-level BEFORE DELETE trigger fires on
-- cascaded deletes too, so this ALSO makes deleting a parent journal entry fail rather than silently
-- taking its lines with it. That is the intended, stronger behaviour: a posted JE is not deletable
-- either — it is reversed.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS + catalogue-guarded REVOKE. No data written.

CREATE OR REPLACE FUNCTION accounting.refuse_journal_entry_posting_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION
    'accounting.journal_entry_postings is WORM: DELETE is refused (line id=%, journal_entry=%, %c %s cents). A journal entry must balance, so a posting line is never removed or voided — post a REVERSING entry instead (reversal_of_line_id / reversed_by_line_id).',
    OLD.id, OLD.journal_entry_uuid, OLD.debit_or_credit, OLD.amount_cents
    USING ERRCODE = 'restrict_violation';
END
$fn$;

DO $$
BEGIN
  IF to_regclass('accounting.journal_entry_postings') IS NULL THEN
    RAISE NOTICE 'ACCT-F131: accounting.journal_entry_postings absent — skipping';
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_journal_entry_postings_no_delete ON accounting.journal_entry_postings;
  CREATE TRIGGER trg_journal_entry_postings_no_delete
    BEFORE DELETE ON accounting.journal_entry_postings
    FOR EACH ROW EXECUTE FUNCTION accounting.refuse_journal_entry_posting_delete();

  REVOKE DELETE ON accounting.journal_entry_postings FROM ih35_app;
  RAISE NOTICE 'ACCT-F131: journal_entry_postings is now WORM (trigger + REVOKE DELETE); correction is reversal-only';
END
$$;
