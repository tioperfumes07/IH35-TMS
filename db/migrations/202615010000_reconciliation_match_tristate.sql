-- 202615010000_reconciliation_match_tristate.sql
-- ROUND 301 A-27 (owner order, verbatim): "we are missing the matched column showing if it is
-- matched to a banking transaction." MATCHED must be matched / unmatched / matched-with-difference
-- -- THREE outcomes, never a boolean. "A near-match silently accepted is how a reconciliation lies."
--
-- EXTENDS banking.reconciliation_matches -- does NOT create a parallel engine (the Lead's explicit
-- instruction: banking.reconciliation_sessions / reconciliation_matches / reconciliation_drift_alerts
-- already exist and must be extended, not duplicated).
--
-- MEASURED BEFORE WRITING, not guessed: reconciliation_matches.ledger_entry_kind is CHECK-constrained
-- to exactly 13 values (payment, bill_payment, transfer, je, expense, load, bill, settlement,
-- driver_bill, factoring_advance, invoice, fuel_transaction, relay_fuel). Every one of those 13
-- tables' real amount column was read from production's own information_schema before this file was
-- written -- none guessed, none left as a silent NULL fallthrough:
--   payment            accounting.payments.amount_cents
--   bill_payment        accounting.bill_payments.amount_cents
--   transfer            banking.transfers.amount_cents
--   je                  SUM(accounting.journal_entry_postings.amount_cents)
--                         WHERE journal_entry_uuid = <id> AND debit_or_credit = 'debit'
--                         (a balanced JE's debit and credit sides are equal; debit side chosen
--                         as the canonical total)
--   expense             accounting.expenses.total_amount_cents
--   load                mdata.loads.rate_total_cents
--   bill                accounting.bills.amount_cents
--   settlement          ROUND(driver_finance.driver_settlements.net_pay * 100)  -- net_pay is
--                         NUMERIC dollars, not cents; the only table of the 13 that is not
--                         cents-native
--   driver_bill         driver_finance.driver_bills.gross_amount_cents
--   factoring_advance   accounting.factoring_advances.advance_amount_cents (the actual cash
--                         advanced -- NOT release_amount_cents or reserve_amount_cents, which are
--                         different accounting events on the same row)
--   invoice             accounting.invoices.total_cents
--   fuel_transaction    ROUND(fuel.fuel_transactions.total_cost * 100)  -- also NUMERIC dollars,
--                         not cents
--   relay_fuel          integrations.relay_fuel_transactions.total_amount_paid_cents
--
-- NO FUZZ TOLERANCE. The comparison is exact-cents equality. A 1-cent difference is
-- 'matched_with_difference', never rounded or thresholded away into 'matched' -- this is the
-- owner's own explicit warning, implemented literally, not softened.
--
-- WHY A FUNCTION PLUS A VIEW, NOT A STORED COLUMN: the tri-state depends on TWO live values (the
-- bank transaction's amount and whatever the matched ledger entry's amount is TODAY) and must never
-- go stale if the ledger entry is later corrected -- a stored/cached tri-state would silently lie
-- exactly the way the owner is warning against. Computed on read, always current.
--
-- ADDITIVE. Creates one function and one view; touches no existing table, column, row, or RLS
-- policy. security_invoker=true on the view so it inherits the caller's own RLS, per the standing
-- law (never a SECURITY DEFINER view bypassing entity scoping).

BEGIN;

CREATE OR REPLACE FUNCTION banking.reconciliation_matched_ledger_amount_cents(
  p_ledger_entry_kind text,
  p_ledger_entry_id uuid
) RETURNS bigint AS $$
DECLARE
  v_amount bigint;
BEGIN
  CASE p_ledger_entry_kind
    WHEN 'payment' THEN
      SELECT amount_cents INTO v_amount FROM accounting.payments WHERE id = p_ledger_entry_id;
    WHEN 'bill_payment' THEN
      SELECT amount_cents INTO v_amount FROM accounting.bill_payments WHERE id = p_ledger_entry_id;
    WHEN 'transfer' THEN
      SELECT amount_cents INTO v_amount FROM banking.transfers WHERE id = p_ledger_entry_id;
    WHEN 'je' THEN
      SELECT SUM(amount_cents) INTO v_amount FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid = p_ledger_entry_id AND debit_or_credit = 'debit';
    WHEN 'expense' THEN
      SELECT total_amount_cents INTO v_amount FROM accounting.expenses WHERE id = p_ledger_entry_id;
    WHEN 'load' THEN
      SELECT rate_total_cents INTO v_amount FROM mdata.loads WHERE id = p_ledger_entry_id;
    WHEN 'bill' THEN
      SELECT amount_cents INTO v_amount FROM accounting.bills WHERE id = p_ledger_entry_id;
    WHEN 'settlement' THEN
      SELECT ROUND(net_pay * 100) INTO v_amount FROM driver_finance.driver_settlements WHERE id = p_ledger_entry_id;
    WHEN 'driver_bill' THEN
      SELECT gross_amount_cents INTO v_amount FROM driver_finance.driver_bills WHERE id = p_ledger_entry_id;
    WHEN 'factoring_advance' THEN
      SELECT advance_amount_cents INTO v_amount FROM accounting.factoring_advances WHERE id = p_ledger_entry_id;
    WHEN 'invoice' THEN
      SELECT total_cents INTO v_amount FROM accounting.invoices WHERE id = p_ledger_entry_id;
    WHEN 'fuel_transaction' THEN
      SELECT ROUND(total_cost * 100) INTO v_amount FROM fuel.fuel_transactions WHERE id = p_ledger_entry_id;
    WHEN 'relay_fuel' THEN
      SELECT total_amount_paid_cents INTO v_amount FROM integrations.relay_fuel_transactions WHERE id = p_ledger_entry_id;
    ELSE
      RAISE EXCEPTION 'reconciliation_matched_ledger_amount_cents: unhandled ledger_entry_kind "%" -- every value in the reconciliation_matches CHECK constraint must be handled here, never silently fall through', p_ledger_entry_kind
        USING ERRCODE = 'check_violation';
  END CASE;
  RETURN v_amount;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION banking.reconciliation_match_tristate(p_bank_transaction_id uuid)
RETURNS text AS $$
DECLARE
  v_bank_amount bigint;
  v_match RECORD;
  v_ledger_amount bigint;
BEGIN
  SELECT amount_cents INTO v_bank_amount
    FROM banking.bank_transactions WHERE id = p_bank_transaction_id;

  SELECT ledger_entry_kind, ledger_entry_id INTO v_match
    FROM banking.reconciliation_matches
   WHERE bank_transaction_id = p_bank_transaction_id
     AND voided_at IS NULL
     AND match_state <> 'rejected'
   ORDER BY matched_at DESC NULLS LAST
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'unmatched';
  END IF;

  v_ledger_amount := banking.reconciliation_matched_ledger_amount_cents(v_match.ledger_entry_kind, v_match.ledger_entry_id);

  IF v_ledger_amount IS NULL OR v_bank_amount IS NULL THEN
    RETURN 'unmatched';
  ELSIF v_ledger_amount = v_bank_amount THEN
    RETURN 'matched';
  ELSE
    RETURN 'matched_with_difference';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW banking.v_bank_transactions_reconciliation
WITH (security_invoker = true) AS
SELECT
  bt.id AS bank_transaction_id,
  bt.operating_company_id,
  bt.bank_account_id,
  bt.created_at AS create_date,
  bt.posted_date AS post_date,
  bt.reconciliation_cleared AS cleared,
  banking.reconciliation_match_tristate(bt.id) AS matched
FROM banking.bank_transactions bt;

COMMIT;
