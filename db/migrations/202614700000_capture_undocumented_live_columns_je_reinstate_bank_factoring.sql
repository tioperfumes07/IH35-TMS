-- 202614700000_capture_undocumented_live_columns_je_reinstate_bank_factoring.sql
--
-- GOVERNANCE FIX, not a schema change: verify-sql-column-existence found 4 real code references to
-- columns that exist live on prod but have NO committed migration anywhere -- same reproducibility
-- gap class as this session's earlier "AUTH-154 script never committed" incident, this time for
-- schema instead of an ops script. Confirmed live (information_schema, prod) before writing this:
--   accounting.journal_entries: reinstated_at, reinstate_reason, reinstated_by_user_id,
--     reinstated_from_void_je_id (used by reinstate-document.service.ts's reinstateJournalEntry;
--     same column set/types as banking.check_number_registry's own reinstate columns, added in
--     202614601800_r274_void_status_checks_and_liability_drift.sql -- mirrored here)
--   banking.bank_transactions: matched_factoring_advance_id uuid (used by posting-engine.service.ts
--     and bank-tx-dedup.ts; sibling columns matched_fuel_transaction_id/
--     matched_relay_fuel_transaction_id were captured in
--     202614520000_bank_match_fuel_relay_clear_columns.sql, which even names this column in its own
--     header comment as "same pattern as" -- but never actually added it)
--
-- Additive only, idempotent (IF NOT EXISTS everywhere) -- a no-op on prod, since every column
-- already exists there. This exists so scripts/verify-schema-parity.mjs's DDL-parsed baseline (the
-- contract verify-sql-column-existence checks code against) can find these columns, instead of
-- every future run flagging real, live, correct code as broken.

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_factoring_advance_id uuid;

COMMENT ON COLUMN accounting.journal_entries.reinstated_at IS
  'Reinstate-engine columns, same shape as banking.check_number_registry -- see reinstate-document.service.ts reinstateJournalEntry.';
COMMENT ON COLUMN banking.bank_transactions.matched_factoring_advance_id IS
  'Denormalized clear pointer to accounting.factoring_advances -- sibling of matched_fuel_transaction_id/matched_relay_fuel_transaction_id.';
