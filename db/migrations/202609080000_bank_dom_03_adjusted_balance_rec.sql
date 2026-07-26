-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] BANK-DOM-03 — true bank-rec adjusted-balance model.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. ***
-- Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill.
--
-- FINDING: reconciliation.routes.ts tied statement_balance to matchedCredits−matchedDebits only —
-- no beginning balance, deposits-in-transit, or outstanding checks (cannot represent timing).
--
-- FIX (additive columns on banking.reconciliation_sessions; app computes DIT/outstanding from
-- banking.bank_transactions.reconciliation_cleared which already exists via 0182):
--   beginning_balance_cents — prior reconciled statement ending (carry-forward)
--   deposits_in_transit_cents / outstanding_checks_cents — last computed snapshot (denormalized)
--   adjusted_bank_balance_cents / adjusted_book_balance_cents — last computed snapshot
--
-- Formula (QBO/NetSuite bank rec):
--   adjusted_bank = statement_ending + deposits_in_transit − outstanding_checks
--   adjusted_book = beginning_balance + cleared_credits − cleared_debits
--   variance = adjusted_bank − adjusted_book  (must be 0 to close)
--
-- No GL math. No feature flag. Posts nothing. FORCE RLS unchanged.

BEGIN;

DO $$
BEGIN
  IF to_regclass('banking.reconciliation_sessions') IS NULL THEN
    RAISE NOTICE 'BANK-DOM-03: reconciliation_sessions absent — skipping';
    RETURN;
  END IF;

  ALTER TABLE banking.reconciliation_sessions
    ADD COLUMN IF NOT EXISTS beginning_balance_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deposits_in_transit_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS outstanding_checks_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS adjusted_bank_balance_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS adjusted_book_balance_cents bigint NOT NULL DEFAULT 0;

  COMMENT ON COLUMN banking.reconciliation_sessions.beginning_balance_cents IS
    'BANK-DOM-03: prior reconciled session statement ending (carry-forward).';
  COMMENT ON COLUMN banking.reconciliation_sessions.deposits_in_transit_cents IS
    'BANK-DOM-03: uncleared credits in the session window (timing).';
  COMMENT ON COLUMN banking.reconciliation_sessions.outstanding_checks_cents IS
    'BANK-DOM-03: uncleared debits in the session window (timing).';
END
$$;

COMMIT;
