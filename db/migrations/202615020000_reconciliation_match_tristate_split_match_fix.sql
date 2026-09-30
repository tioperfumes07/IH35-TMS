-- 202615020000_reconciliation_match_tristate_split_match_fix.sql
-- RECON-TRISTATE-SPLIT-MATCH-BLIND-SPOT-2026093014 (CC-2, ROUND 301 B-32, found live while
-- auditing the bank-feed match criteria for A-27's new tri-state MATCHED column, PR #23540,
-- migration 202615010000).
--
-- THE BUG: banking.reconciliation_match_tristate() selected ONE reconciliation_matches row per
-- bank transaction via `ORDER BY matched_at DESC NULLS LAST LIMIT 1` and compared the bank
-- transaction's full amount against that single row's resolved ledger amount. banking
-- .reconciliation_matches allows MORE THAN ONE active (non-voided, non-rejected) match per
-- bank_transaction_id -- the real, live shape of a single ACH deposit funding several
-- factoring_advance rows in one batch. CC-2 measured 12 such live split-match groups on USMCA
-- today, every one of which sums EXACTLY to its bank transaction's amount (example cited:
-- bank_transaction 6bd50475-1954-4b90-8de9-3f47206ae35c, 5 matches, bank $16,383.00 = sum
-- $16,383.00 -- a provably correct match). The single-row comparison would have classified every
-- one of those 12 as 'matched_with_difference' the moment this function's caller starts reading
-- real matched bank transactions, once 202615010000 is applied to prod.
--
-- THE FIX: sum every active match's resolved ledger amount for the bank transaction and compare
-- the TOTAL against the bank amount. A single-match bank transaction is simply the n=1 case of the
-- same sum, so this does not change behavior for any non-split transaction. If any individual
-- match's ledger amount cannot be resolved (a dangling reference), the function returns
-- 'unmatched' rather than silently summing a partial, wrong total -- never guess the rest of a
-- group whose total is already unknown.
--
-- WHY A SEPARATE MIGRATION, NOT AN EDIT TO 202615010000: that file is already merged to main.
-- Editing a merged migration file, even one not yet applied to prod, is not this session's
-- practice (see docs/bus/2026-09-30-LEAD-RULING-H3-MIGRATION-FILE-LANE-CROSS.md for exactly why
-- that pattern is refused elsewhere this same day) -- a second, additive CREATE OR REPLACE
-- FUNCTION is the same shape every other function fix in this repo uses.
--
-- DESIGN VERIFIED live in a throwaway rolled-back transaction against br-fancy-credit-akjnd07a
-- before this file was written: a synthetic bank transaction with TWO active matches (two
-- different expense rows) summing exactly to the bank amount resolves 'matched' (was
-- 'matched_with_difference' under the old single-row logic); the same setup with one match
-- 'rejected' correctly excludes it from the sum; a single-match transaction's behavior is
-- unchanged from before. Rolled back -- nothing written to prod.
--
-- ADDITIVE. CREATE OR REPLACE FUNCTION only -- no table, column, or data touched.

BEGIN;

CREATE OR REPLACE FUNCTION banking.reconciliation_match_tristate(p_bank_transaction_id uuid)
RETURNS text AS $$
DECLARE
  v_bank_amount bigint;
  v_match RECORD;
  v_ledger_amount bigint;
  v_total_ledger_amount bigint := 0;
  v_match_count int := 0;
BEGIN
  SELECT amount_cents INTO v_bank_amount
    FROM banking.bank_transactions WHERE id = p_bank_transaction_id;

  -- Sum every active match, not just the most recent one -- see header comment for why.
  FOR v_match IN
    SELECT ledger_entry_kind, ledger_entry_id
      FROM banking.reconciliation_matches
     WHERE bank_transaction_id = p_bank_transaction_id
       AND voided_at IS NULL
       AND match_state <> 'rejected'
  LOOP
    v_match_count := v_match_count + 1;
    v_ledger_amount := banking.reconciliation_matched_ledger_amount_cents(v_match.ledger_entry_kind, v_match.ledger_entry_id);
    IF v_ledger_amount IS NULL THEN
      -- A dangling/unresolvable match makes the whole group's total unknown -- report the honest
      -- unmatched state rather than sum a partial, wrong total.
      RETURN 'unmatched';
    END IF;
    v_total_ledger_amount := v_total_ledger_amount + v_ledger_amount;
  END LOOP;

  IF v_match_count = 0 THEN
    RETURN 'unmatched';
  END IF;

  IF v_bank_amount IS NULL THEN
    RETURN 'unmatched';
  ELSIF v_total_ledger_amount = v_bank_amount THEN
    RETURN 'matched';
  ELSE
    RETURN 'matched_with_difference';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
