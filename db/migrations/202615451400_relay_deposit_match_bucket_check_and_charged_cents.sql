-- 202615451400_relay_deposit_match_bucket_check_and_charged_cents.sql
-- Cursor · ROUND 443.54 — (1) chk_bank_line_bucket_matches_link must count matched_relay_deposit_id
-- (and matched_deposit_id / matched_related_party_loan_id) so accept of a Relay deposit match can
-- clear the bank line. bank_line_classify already treats those pointers as linked; the CHECK was
-- behind and refused the stamp (fork proof 2026-10-11). (2) bank_line_match_amount / reconciliation
-- matched ledger amount for relay_deposit = total_amount_cents (CHARGED). Never add the 3.25% fee
-- again — that double-count is why 0 of 17 BoA lines matched.
-- Idempotent. CREATE OR REPLACE / DROP CONSTRAINT IF EXISTS + ADD. No data rewrite.

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE banking.bank_transactions DROP CONSTRAINT IF EXISTS chk_bank_line_bucket_matches_link;
ALTER TABLE banking.bank_transactions ADD CONSTRAINT chk_bank_line_bucket_matches_link
  CHECK (
    (review_bucket = 'categorized') = (
      num_nonnulls(
        matched_advance_id, matched_bill_id, matched_bill_payment_id, matched_expense_id,
        matched_factoring_advance_id, matched_fuel_transaction_id, matched_invoice_id,
        matched_journal_entry_id, matched_load_id, matched_payment_id, matched_relay_fuel_transaction_id,
        matched_settlement_id, matched_transfer_id, matched_deposit_id, matched_related_party_loan_id,
        matched_relay_deposit_id, linked_entity_id
      ) > 0
      OR status IN ('split', 'transfer')
      OR transfer_kind IS NOT NULL
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION banking.reconciliation_matched_ledger_amount_cents(p_ledger_entry_kind text, p_ledger_entry_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
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
    WHEN 'deposit' THEN
      SELECT amount_deposited_cents INTO v_amount FROM accounting.deposits WHERE id = p_ledger_entry_id;
    WHEN 'related_party_loan' THEN
      SELECT principal_cents INTO v_amount FROM accounting.related_party_loan_entries WHERE id = p_ledger_entry_id;
    WHEN 'relay_deposit' THEN
      -- CHARGED = wallet + fee already stored on the row. Do not add fee again.
      SELECT rd.total_amount_cents INTO v_amount FROM integrations.relay_deposits rd WHERE rd.id = p_ledger_entry_id;
    WHEN 'advance' THEN
      SELECT amount_cents INTO v_amount FROM driver_finance.driver_advances WHERE id = p_ledger_entry_id;
    ELSE
      RAISE EXCEPTION 'reconciliation_matched_ledger_amount_cents: unhandled ledger_entry_kind "%" -- every value in the reconciliation_matches CHECK constraint must be handled here, never silently fall through', p_ledger_entry_kind
        USING ERRCODE = 'check_violation';
  END CASE;
  RETURN v_amount;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bank_line_bucket_matches_link'
      AND conrelid = 'banking.bank_transactions'::regclass
      AND pg_get_constraintdef(oid) LIKE '%matched_relay_deposit_id%'
  ) THEN
    RAISE EXCEPTION '202615451400: chk_bank_line_bucket_matches_link missing matched_relay_deposit_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'banking' AND p.proname = 'reconciliation_matched_ledger_amount_cents'
      AND pg_get_functiondef(p.oid) LIKE '%relay_deposit%total_amount_cents%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%total_amount_cents + (rd.total_amount_cents * 325%'
  ) THEN
    RAISE EXCEPTION '202615451400: reconciliation_matched_ledger_amount_cents still double-counts relay_deposit fee';
  END IF;
END $$;

COMMIT;
