-- 202615440500_expense_source_bank_transaction.sql
-- CC-1 · ROUND 441.5 Phase 1 — a categorized money-out bank line creates an EXPENSE document, linked both ways.
--
-- Owner, 2026-10-07: "ours should work exactly as quickbooks." When QBO categorizes a bank-feed line it creates the
-- document (an Expense, with the payee), it does not write a bare journal entry. Until now the categorize poster wrote
-- a bare bank_categorization JE: measured 2026-10-07, five USMCA cost lines ($203.14 on 6300 / 6310 / 6900) with no
-- expense document, which verify-costs-are-expenses-not-handwritten-jes refuses.
--
-- The bank line already names the expense (banking.bank_transactions.matched_expense_id). This adds the other direction
-- on the document, the same shape bills, bill payments and customer payments already carry: the line that created it.
-- Undo of the line voids exactly that expense (bank-line-state-machine voidDocumentsCreatedByLine), and voiding the
-- expense releases the line (void.service BANK_MATCH_REVERSE_TABLE).
--   - FK to banking.bank_transactions(id), the shape accounting.bills already uses (bank_transactions has no
--     (operating_company_id, id) key to reference); the writer pins the line to the expense's company
--   - one LIVE expense per bank line (partial unique index); a voided one does not block re-categorizing
-- Additive, nullable, idempotent. No existing row changes.

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS source_bank_transaction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_source_bank_transaction_id_fkey') THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_source_bank_transaction_id_fkey
      FOREIGN KEY (source_bank_transaction_id) REFERENCES banking.bank_transactions (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_live_source_bank_transaction
  ON accounting.expenses (operating_company_id, source_bank_transaction_id)
  WHERE source_bank_transaction_id IS NOT NULL AND voided_at IS NULL;
