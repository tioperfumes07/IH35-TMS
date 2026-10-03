-- 202615360800_reclassify_moves_posted_expense_line_account_with_its_entry.sql
-- ROUND 368.1 / 370 (CC-2). Measured 2026-10-03 on a fork of production: the Reclassify engine could not reclassify a
-- single expense. 202615170700 refuses ANY change to a posted expense line's account ("reverse and reissue ... or a
-- reclassification engine that posts") — and the engine that posts was refused with everything else, so every expense
-- the owner selected came back "refused".
--
-- The protection is kept at full strength and made exact:
--   * AMOUNT (amount_cents / amount) of a line under a live journal entry: still refused, always.
--   * ACCOUNT of a line under a live journal entry: allowed ONLY when, at COMMIT, a reclassify batch line for that exact
--     document line proves the ledger moved with it — a live RECLASSIFICATION entry carrying the line to this account,
--     or (undo) the undo entry carrying it back. Checked by a CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED, because
--     the engine rewrites the line, posts the entry and records the batch line inside one transaction.
-- Any other path that recodes a posted line's account (the 2026-09-30 5010 -> 5000 class) is still refused at COMMIT.
-- ADDITIVE + IDEMPOTENT. No data written.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION accounting.refuse_posted_expense_line_money_edit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF (NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR NEW.amount IS DISTINCT FROM OLD.amount)
     AND EXISTS (
       SELECT 1
         FROM accounting.expenses e
         JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
        WHERE e.id = NEW.expense_id
          AND je.voided_at IS NULL
          AND je.reversed_by_je_id IS NULL
     ) THEN
    RAISE EXCEPTION 'accounting.expense_lines %: the amount of a line under a live journal entry cannot change -- reverse and reissue the document so the ledger moves with it', NEW.id
      USING ERRCODE = '23514';
  END IF;
  -- An ACCOUNT change is judged at COMMIT by trg_expense_lines_posted_account_moves_with_its_entry.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.refuse_posted_expense_line_account_without_its_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_account uuid;
  v_expense uuid;
BEGIN
  SELECT expense_account_uuid, expense_id INTO v_account, v_expense FROM accounting.expense_lines WHERE id = NEW.id;
  IF NOT FOUND OR v_account IS NOT DISTINCT FROM OLD.expense_account_uuid THEN
    RETURN NULL;   -- gone, or back where it started
  END IF;
  IF NOT EXISTS (
       SELECT 1
         FROM accounting.expenses e
         JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
        WHERE e.id = v_expense AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL) THEN
    RETURN NULL;   -- not under a live entry: a draft / voided document may be recoded freely
  END IF;
  IF EXISTS (
       SELECT 1
         FROM accounting.reclassify_batch_lines bl
         JOIN accounting.journal_entries rj ON rj.id = bl.reclass_journal_entry_id
        WHERE bl.source_transaction_type = 'expense'
          AND bl.source_transaction_line_id = NEW.id::text
          AND bl.result = 'applied'
          AND ((bl.to_account_id = v_account AND bl.undo_journal_entry_id IS NULL
                AND rj.status = 'posted' AND rj.reversed_by_je_id IS NULL AND rj.voided_at IS NULL)
            OR (bl.from_account_id = v_account AND bl.undo_journal_entry_id IS NOT NULL))) THEN
    RETURN NULL;   -- the reclassify engine moved the ledger with the line (or undid it), in this transaction
  END IF;
  RAISE EXCEPTION 'accounting.expense_lines %: the account of a line under a live journal entry changed with no reclassification entry moving the ledger with it -- use Reclassify, or reverse and reissue the document', NEW.id
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_lines_posted_account_moves_with_its_entry ON accounting.expense_lines;
CREATE CONSTRAINT TRIGGER trg_expense_lines_posted_account_moves_with_its_entry
  AFTER UPDATE OF expense_account_uuid ON accounting.expense_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.expense_account_uuid IS DISTINCT FROM OLD.expense_account_uuid)
  EXECUTE FUNCTION accounting.refuse_posted_expense_line_account_without_its_entry();

-- The BEFORE trigger now watches the amount only (the account is judged at COMMIT above).
DROP TRIGGER IF EXISTS trg_expense_lines_posted_money_immutable ON accounting.expense_lines;
CREATE TRIGGER trg_expense_lines_posted_money_immutable
  BEFORE UPDATE OF amount_cents, amount ON accounting.expense_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_posted_expense_line_money_edit();

COMMIT;
