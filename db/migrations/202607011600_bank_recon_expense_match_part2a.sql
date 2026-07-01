-- BLOCK-01 Part 2a: Banking Match — enable 'expense' as an acceptable match kind.
-- Tier-1 (schema change on bank/accounting-adjacent tables). Flag-free: this is a linkage +
-- clear, not a GL posting. Any penny variance reuses the EXISTING variance poster
-- (accounting.journal_entries via postDifferenceJournalEntry) — no new GL math here.
--
-- 'bill' is intentionally NOT added: recording a bill payment with no GL JE is the orphan write
-- we forbid; Part 2b (BLOCK-02 CHAIN-04) unblocks it later. Idempotent / forward-only.

BEGIN;

-- (1) Widen the ledger_entry_kind CHECK to allow 'expense'. The original constraint
--     (migration 0219_block_29_bank_reconciliation_matches.sql) was created inline and
--     auto-named <table>_<column>_check. DROP IF EXISTS then re-ADD named, so the migration
--     is safe to re-apply on a fresh DB from 0001.
ALTER TABLE bank.reconciliation_matches
  DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;

ALTER TABLE bank.reconciliation_matches
  ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
  CHECK (ledger_entry_kind IN ('payment', 'bill_payment', 'transfer', 'je', 'expense'));

-- (2) Denormalized convenience FK on the bank transaction, matching the existing matched_*_id
--     columns from migration 0182_p7_w2_bank_transactions_review.sql. Inherits the table's
--     ih35_app grants (no new schema/table → no new GRANT needed).
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_expense_id uuid REFERENCES accounting.expenses(id);

COMMIT;
