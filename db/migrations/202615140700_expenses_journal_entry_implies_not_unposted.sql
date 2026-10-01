-- 202615140700_expenses_journal_entry_implies_not_unposted.sql
-- CC-2 (band HH 06-08), fuel cost posting chain, owner law 2026-10-01 "fix all issues at root".
--
-- Measured live 2026-10-01: 94 USMCA accounting.expenses rows carry a LIVE journal_entry_id while
-- posting_status = 'unposted' (5 fuel documents from createExpenseFromFuelTransaction's adopt path,
-- 89 settlement-feed documents whose JE was attached later without the status). The expense void
-- route reverses only posting_status = 'posted', so voiding any of them would leave its entry live
-- under a voided document; the post route would treat them as never posted.
--
-- status = 'posted' with NO journal entry is legitimate and stays allowed (27,070 QBO-mirrored
-- documents: posted in QBO, deliberately unposted in the TMS GL). The invariant is therefore only:
--   a document that carries a journal entry is never 'unposted'.
--
-- NOT VALID first (enforced for every new write at once); VALIDATE runs here only when no violator
-- remains, so this file never fails a deploy on data. The 94 are repaired by the AUTH-188 ops script
-- (scripts/ops/2026-10-01-cc2-auth188-expense-je-posting-status.ts); guard 12039 fails while any
-- violator exists or the constraint is unvalidated.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.expenses'::regclass AND conname = 'expenses_journal_entry_implies_not_unposted'
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_journal_entry_implies_not_unposted
      CHECK (journal_entry_id IS NULL OR posting_status <> 'unposted') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.expenses'::regclass AND conname = 'expenses_journal_entry_implies_not_unposted'
       AND NOT convalidated
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM accounting.expenses WHERE journal_entry_id IS NOT NULL AND posting_status = 'unposted') THEN
      ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_journal_entry_implies_not_unposted;
    ELSE
      RAISE NOTICE 'expenses_journal_entry_implies_not_unposted left NOT VALID: violators remain (AUTH-188 repairs them; guard 12039 reports them)';
    END IF;
  END IF;
END
$$;

COMMIT;
