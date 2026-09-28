-- 202614520000_bank_match_fuel_relay_clear_columns.sql
-- ROUND 186 — clear-columns for fuel_transaction + relay_fuel accepts (same pattern as
-- matched_factoring_advance_id). Additive only. Idempotent.
--
-- fuel_transaction was already in banking.reconciliation_matches.ledger_entry_kind CHECK
-- (Lead 2026-09-28) but accept could not flip review_state='matched' without a matched_*_id
-- (verify-matched-state-requires-matched-id). relay_fuel is the integrations.relay_fuel_transactions
-- source of truth for the Relay Fuel Wallet rail — never parse bank description to build a doc.

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_fuel_transaction_id uuid;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_relay_fuel_transaction_id uuid;

COMMENT ON COLUMN banking.bank_transactions.matched_fuel_transaction_id IS
  'ROUND 186 — denormalized clear pointer to fuel.fuel_transactions (Dreamline diesel card).';

COMMENT ON COLUMN banking.bank_transactions.matched_relay_fuel_transaction_id IS
  'ROUND 186 — denormalized clear pointer to integrations.relay_fuel_transactions (Relay wallet).';

-- Widen reconciliation_matches kind CHECK to include relay_fuel (fuel_transaction already present).
ALTER TABLE banking.reconciliation_matches
  DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;

ALTER TABLE banking.reconciliation_matches
  ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
  CHECK (ledger_entry_kind = ANY (ARRAY[
    'payment'::text,
    'bill_payment'::text,
    'transfer'::text,
    'je'::text,
    'expense'::text,
    'load'::text,
    'bill'::text,
    'settlement'::text,
    'driver_bill'::text,
    'factoring_advance'::text,
    'invoice'::text,
    'fuel_transaction'::text,
    'relay_fuel'::text
  ]));
