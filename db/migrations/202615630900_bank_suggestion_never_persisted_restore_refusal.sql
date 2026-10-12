-- 202615630900_bank_suggestion_never_persisted_restore_refusal.sql
-- CC-3 · RULING 443.81 #1 (owner: never automatch; suggestions are read-only, nothing persists them). Restores
-- banking.refuse_live_match_row_on_released_line to refuse a live 'auto_matched' OR 'user_matched' row on a bank line that
-- carries no document — exactly the body before 202615610900 (a). A bank suggestion is computed and shown, never written.
BEGIN;
SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION banking.refuse_live_match_row_on_released_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_state text;
  v_row_voided timestamptz;
  v_line_ok boolean;
BEGIN
  SELECT match_state, voided_at INTO v_state, v_row_voided FROM banking.reconciliation_matches WHERE id = NEW.id;
  IF NOT FOUND OR v_row_voided IS NOT NULL OR v_state NOT IN ('auto_matched', 'user_matched') THEN
    RETURN NULL;
  END IF;
  SELECT bt.voided_at IS NULL
         AND (num_nonnulls(bt.matched_advance_id, bt.matched_bill_id, bt.matched_bill_payment_id, bt.matched_expense_id,
                           bt.matched_factoring_advance_id, bt.matched_fuel_transaction_id, bt.matched_invoice_id,
                           bt.matched_journal_entry_id, bt.matched_load_id, bt.matched_payment_id,
                           bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id,
                           bt.matched_deposit_id, bt.matched_related_party_loan_id, bt.matched_relay_deposit_id,
                           bt.linked_entity_id) > 0
              OR bt.status IN ('split', 'transfer') OR bt.transfer_kind IS NOT NULL)
    INTO v_line_ok
    FROM banking.bank_transactions bt WHERE bt.id = NEW.bank_transaction_id;
  IF NOT COALESCE(v_line_ok, false) THEN
    RAISE EXCEPTION 'live match row % (% %) sits on bank line % which carries no document', NEW.id, NEW.ledger_entry_kind, NEW.ledger_entry_id, NEW.bank_transaction_id
      USING ERRCODE = 'check_violation',
            HINT = 'Unmatch retires the row (voided, rejected) in the same transaction it releases the line (ROUND 368.2(b)).';
  END IF;
  RETURN NULL;
END
$function$;

COMMIT;
