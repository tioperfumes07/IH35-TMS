-- B-1b Account Register ✓ blank↔C (ORDERS-2026-10-01-BANKING-REGISTER-SET §1 / §3).
-- Claimed 202615201200 (Cursor HH 12). Additive columns only — never DROP.
-- register_cleared lets the operator toggle blank↔C on a posting without inventing a second
-- engine. R remains owned exclusively by a closed banking.reconciliation_sessions row via the
-- bank-feed match (see account-register.service match_info lateral). Bank-match C still wins
-- when a bank_transactions row is linked; this flag covers manual clear when no match exists.

SET lock_timeout = '5s';

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS register_cleared boolean NOT NULL DEFAULT false;

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS register_cleared_at timestamptz;

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS register_cleared_by_user_id uuid REFERENCES identity.users(id);

COMMENT ON COLUMN accounting.journal_entry_postings.register_cleared IS
  'B-1b QBO register ✓: operator-cleared (C) independent of bank-feed match. R still comes only from a closed reconciliation session.';
