-- 202615170700_expense_posted_line_money_fields_immutable.sql
-- CC-2 (band HH 06-08), fuel cost posting chain, owner law 2026-10-01 "fix all issues at root".
--
-- Measured 2026-10-01: three settlement-5781 expense lines were recoded 5010 -> 5000 at 2026-09-30 07:43Z,
-- AFTER their document had posted, without reposting -- the ledger kept $518.80 of reefer diesel in 5010 DEF
-- while the document said 5000 (repaired under AUTH-189 by reversal + reissue). Nothing stopped the edit.
--
-- A posted document is corrected by reversal + reissue (or a reclassification engine that posts), never by
-- editing a line under its posting. This trigger refuses a change to expense_account_uuid, amount_cents or
-- amount on a line whose expense carries a journal entry that is still live. Description, category and load
-- attribution edits stay allowed (expense-parse-backfill and work-order sync write those). Drafts are untouched.
-- ADDITIVE + IDEMPOTENT. No data written.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.refuse_posted_expense_line_money_edit() RETURNS trigger AS $$
BEGIN
  IF (NEW.expense_account_uuid IS DISTINCT FROM OLD.expense_account_uuid
      OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
      OR NEW.amount IS DISTINCT FROM OLD.amount)
     AND EXISTS (
       SELECT 1
         FROM accounting.expenses e
         JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
        WHERE e.id = NEW.expense_id
          AND je.voided_at IS NULL
          AND je.reversed_by_je_id IS NULL
     ) THEN
    RAISE EXCEPTION 'accounting.expense_lines %: the account or amount of a line under a live journal entry cannot change -- reverse and reissue the document so the ledger moves with it', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_lines_posted_money_immutable ON accounting.expense_lines;
CREATE TRIGGER trg_expense_lines_posted_money_immutable
  BEFORE UPDATE OF expense_account_uuid, amount_cents, amount ON accounting.expense_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_posted_expense_line_money_edit();

COMMIT;
