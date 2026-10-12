-- 202615610900_g6_suggestion_without_pointer_and_fuel_duplicate_on_base_invoice.sql
-- CC-3 · RULING 443.80 #2 (one migration PR, G6 + G4).
-- (a) banking.refuse_live_match_row_on_released_line (trigger trg_live_match_row_has_a_linked_line): a live match row on a bank
--     line with no document pointer was refused for 'auto_matched' AND 'user_matched'. A SUGGESTION is not a match — it needs
--     no pointer on the line; the bank-suggestion engine could not write one (G6: Relay wallet lines 258 with 0 suggestions).
--     Now only an ACCEPTED match ('user_matched') must sit on a line that carries its document. Same refusal otherwise.
-- (b) CC-2 443.76 (d): fuel.refuse_duplicate_provider_transaction keyed on the BASE invoice — a re-feed's "<invoice>-<load>"
--     suffix is stripped on both sides, so the database refuses a second expense of the same purchase exactly as the app
--     writers do (fuel-provider-reference.ts). Live USMCA has 0 duplicate base-invoice pairs (AUTH-439 / AUTH-440 voided them).
-- Function bodies + one index; no rows written.
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
  -- RULING 443.80 #2: a suggestion (any state but an accepted match) needs no document pointer on the line.
  IF NOT FOUND OR v_row_voided IS NOT NULL OR v_state <> 'user_matched' THEN
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
CREATE OR REPLACE FUNCTION fuel.provider_base_reference(p_ref text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public AS $f$
  SELECT CASE WHEN btrim(p_ref) ~ '^[0-9]+(-1[0-9]{4})?$' THEN regexp_replace(btrim(p_ref), '-1[0-9]{4}$', '') ELSE NULL END
$f$;

CREATE OR REPLACE FUNCTION fuel.refuse_duplicate_provider_transaction() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_ref text := fuel.provider_base_reference(NEW.transaction_reference);
  v_existing record;
BEGIN
  IF NEW.voided_at IS NOT NULL OR v_ref IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'fuel_provider_txn:' || NEW.operating_company_id::text || ':' || COALESCE(NEW.vendor_id::text, '-') || ':' || v_ref
      || ':' || COALESCE(NEW.fuel_type::text, '-'), 0));
  SELECT f.id, l.load_number INTO v_existing
    FROM fuel.fuel_transactions f
    LEFT JOIN mdata.loads l ON l.id = f.load_id
   WHERE f.operating_company_id = NEW.operating_company_id
     AND f.vendor_id IS NOT DISTINCT FROM NEW.vendor_id
     AND fuel.provider_base_reference(f.transaction_reference) = v_ref
     AND f.fuel_type IS NOT DISTINCT FROM NEW.fuel_type
     AND f.voided_at IS NULL
     AND f.id <> NEW.id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'fuel_provider_transaction_already_recorded:%', v_ref
      USING ERRCODE = '23505',
            DETAIL = format('fuel transaction %s (load %s) already records provider transaction %s (%s) for this company and vendor',
                            v_existing.id, COALESCE(v_existing.load_number, 'none'), v_ref, COALESCE(NEW.fuel_type::text, 'no product')),
            HINT = 'One provider transaction is one purchase per product line — a "-<load>" suffix does not make it a new purchase. Open the existing row; if it is wrong, reverse and void it first.';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE INDEX IF NOT EXISTS idx_fuel_tx_live_provider_base_reference_product
  ON fuel.fuel_transactions (operating_company_id, vendor_id, (fuel.provider_base_reference(transaction_reference)), fuel_type)
  WHERE voided_at IS NULL;
DROP INDEX IF EXISTS fuel.idx_fuel_tx_live_provider_reference_product;

COMMIT;
